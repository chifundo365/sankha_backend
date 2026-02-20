import { Request, Response } from "express";
import prismaClient from "../prismaClient";
import { successResponse, errorResponse } from "../utils/response";
import { paymentService } from "../services/payment.service";
import { Prisma } from "../../generated/prisma";
import { orderConfirmationService } from "../services/orderConfirmation.service";
import crypto from 'crypto';
import { emailService } from '../services/email.service';
import smsService from '../services/sms.service';
import { CloudinaryService } from '../services/cloudinary.service';

/**
 * Generate unique order number
 * Format: ORD-YYYY-XXXXXX (e.g., ORD-2025-000001)
 */
const generateOrderNumber = async (): Promise<string> => {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}-`;

  // Get the latest order number for this year
  const lastOrder = await prismaClient.orders.findFirst({
    where: {
      order_number: {
        startsWith: prefix,
      },
      status: {
        not: "CART",
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });

  let nextNumber = 1;
  if (lastOrder && lastOrder.order_number) {
    const lastNumber = parseInt(lastOrder.order_number.split("-")[2], 10);
    nextNumber = lastNumber + 1;
  }

  return `${prefix}${nextNumber.toString().padStart(6, "0")}`;
};

/**
 * Checkout - Convert cart to order and initiate payment
 * POST /api/orders/checkout
 * 
 * Flow:
 * 1. Validate delivery address
 * 2. Validate cart and stock
 * 3. Create order with PENDING_PAYMENT status
 * 4. Reserve stock (reduce quantity)
 * 5. Initiate PayChangu payment (if online payment)
 * 6. Return checkout URL for payment
 * 7. Webhook/verification confirms order after payment
 */
export const checkout = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { 
      delivery_address_id, 
      payment_method,
      customer_email,
      customer_phone,
      customer_first_name,
      customer_last_name
    } = req.body;

    // 1. Verify delivery address exists and belongs to user
    const deliveryAddress = await prismaClient.user_addresses.findUnique({
      where: { id: delivery_address_id },
    });

    if (!deliveryAddress) {
      return errorResponse(res, "Delivery address not found", 404);
    }

    if (deliveryAddress.user_id !== userId) {
      return errorResponse(
        res,
        "Unauthorized to use this delivery address",
        403
      );
    }

    // 2. Get all user's carts
    const carts = await prismaClient.orders.findMany({
      where: {
        buyer_id: userId,
        status: "CART",
      },
      include: {
        order_items: {
          include: {
            shop_products: true,
          },
        },
        shops: true,
      },
    });

    if (carts.length === 0) {
      return errorResponse(res, "Your cart is empty", 400);
    }

    // 3. Validate stock for all items across all carts
    const stockIssues = [];
    for (const cart of carts) {
      for (const item of cart.order_items) {
        if (!item.shop_products) {
          stockIssues.push({
            product: item.product_name,
            issue: "Product no longer available",
          });
          continue;
        }

        if (!item.shop_products.is_available) {
          stockIssues.push({
            product: item.product_name,
            issue: "Product is currently unavailable",
          });
        }

        if (item.shop_products.stock_quantity < item.quantity) {
          stockIssues.push({
            product: item.product_name,
            requested: item.quantity,
            available: item.shop_products.stock_quantity,
            issue: `Insufficient stock. Only ${item.shop_products.stock_quantity} available`,
          });
        }
      }
    }

    if (stockIssues.length > 0) {
      return errorResponse(
        res,
        "Some items in your cart are no longer available or have insufficient stock",
        {
          issues: stockIssues,
        },
        400
      );
    }

    // 4. Process checkout for each cart (one order per shop)
    const pendingOrders = [];
    const orderIds: string[] = [];

    // Calculate total amount across all carts
    const totalAmount = carts.reduce((sum, cart) => sum + Number(cart.total_amount), 0);

    for (const cart of carts) {
      // Generate order number
      const orderNumber = await generateOrderNumber();

      // Determine initial status based on payment method
      const initialStatus = payment_method === "paychangu" ? "PENDING_PAYMENT" : "CONFIRMED";

      // Update cart to pending payment order
      // Determine snapshot delivery fields: prefer explicit recipient/logistics fields from request when provided
      const recipientNameFromReq = (req.body as any).recipient_name;
      const recipientPhoneFromReq = (req.body as any).recipient_phone;
      const deliveryUpdateToken = crypto.randomBytes(16).toString('hex');
      const deliveryMethod = (req.body as any).delivery_method || 'HOME_DELIVERY';
      const deliveryLatFromReq = (req.body as any).delivery_lat;
      const deliveryLngFromReq = (req.body as any).delivery_lng;
      const deliveryDirectionsFromReq = (req.body as any).delivery_directions;
      const depotNameFromReq = (req.body as any).depot_name;
      const depotLatFromReq = (req.body as any).depot_lat;
      const depotLngFromReq = (req.body as any).depot_lng;
      const preferredCarrierFromReq = (req.body as any).preferred_carrier_details;
      const packageLabelFromReq = (req.body as any).package_label_text;

      // Compute cart subtotal for this shop
      const cartSubtotal = (cart.order_items || []).reduce((s: number, it: any) => s + Number(it.unit_price ?? it.base_price ?? 0) * Number(it.quantity || 0), 0);
      // Seller pricing config (fallbacks to 0)
      const shopObj = (cart as any).shops || {};
      // Validate the shop supports the chosen delivery method
      const shopDeliveryMethods: string[] = (shopObj && (shopObj as any).delivery_methods) || [];
      const deliveryMethodSupported = (() => {
        if (!shopDeliveryMethods || shopDeliveryMethods.length === 0) return false;
        if (deliveryMethod === 'DEPOT_COLLECTION') {
          return shopDeliveryMethods.includes('PICKUP_POINT');
        }
        // HOME_DELIVERY maps to DOOR_TO_DOOR or COURIER in shop settings
        return shopDeliveryMethods.includes('DOOR_TO_DOOR') || shopDeliveryMethods.includes('COURIER');
      })();

      if (!deliveryMethodSupported) {
        return errorResponse(
          res,
          `Selected delivery method ${deliveryMethod} is not supported by shop ${(shopObj && (shopObj as any).name) || 'this seller'}`,
          null,
          400
        );
      }
      const freeThreshold = Number((shopObj as any)?.free_delivery_threshold ?? 0);
      const baseFee = Number((shopObj as any)?.base_delivery_fee ?? 0);
      const intercityFee = Number((shopObj as any)?.intercity_delivery_fee ?? baseFee ?? 0);
      // Determine delivery fee using rules: free if subtotal >= threshold; HOME uses baseFee; DEPOT uses intercityFee
      let computedDeliveryFee = 0;
      if (cartSubtotal >= freeThreshold && freeThreshold > 0) {
        computedDeliveryFee = 0;
      } else {
        if (deliveryMethod === 'DEPOT_COLLECTION') {
          computedDeliveryFee = intercityFee;
        } else {
          computedDeliveryFee = baseFee;
        }
      }

      const pendingOrder = await prismaClient.orders.update({
        where: { id: cart.id },
        data: {
          order_number: orderNumber,
          status: initialStatus,
          delivery_address_id: delivery_address_id,
          // Snapshot recipient details so they remain immutable for this order
          recipient_name: recipientNameFromReq || undefined,
          recipient_phone: recipientPhoneFromReq || undefined,
          delivery_update_token: deliveryUpdateToken || undefined,
          // Logistics fork snapshot
          delivery_method: deliveryMethod as any,
          delivery_lat: deliveryMethod === 'HOME_DELIVERY' && deliveryLatFromReq !== undefined ? deliveryLatFromReq : undefined,
          delivery_lng: deliveryMethod === 'HOME_DELIVERY' && deliveryLngFromReq !== undefined ? deliveryLngFromReq : undefined,
          delivery_directions: deliveryMethod === 'HOME_DELIVERY' ? (deliveryDirectionsFromReq || undefined) : undefined,
          depot_name: deliveryMethod === 'DEPOT_COLLECTION' ? (depotNameFromReq || undefined) : undefined,
          depot_lat: deliveryMethod === 'DEPOT_COLLECTION' && depotLatFromReq !== undefined ? depotLatFromReq : undefined,
          depot_lng: deliveryMethod === 'DEPOT_COLLECTION' && depotLngFromReq !== undefined ? depotLngFromReq : undefined,
          preferred_carrier_details: deliveryMethod === 'DEPOT_COLLECTION' ? (preferredCarrierFromReq || undefined) : undefined,
          package_label_text: deliveryMethod === 'DEPOT_COLLECTION' ? (packageLabelFromReq || undefined) : undefined,
          // Money side snapshot
          delivery_fee: computedDeliveryFee !== undefined ? computedDeliveryFee : undefined,
          destination_name: deliveryMethod === 'DEPOT_COLLECTION' ? (depotNameFromReq || recipientNameFromReq || undefined) : (recipientNameFromReq || undefined),
          updated_at: new Date(),
        } as any,
        include: {
          order_items: {
            include: {
              shop_products: {
                include: {
                  products: true,
                },
              },
            },
          },
          shops: true,
          user_addresses: true,
        },
      });

      // 5. Reserve stock by reducing quantity (trigger handles logging)
      for (const item of cart.order_items) {
        if (item.shop_products) {
          const reason = `Stock reserved - Order ${orderNumber} (${payment_method === "paychangu" ? "pending payment" : "confirmed"})`;
          await prismaClient.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL app.stock_change_reason = '${reason.replace(/'/g, "''")}'`);
            await tx.shop_products.update({
              where: { id: item.shop_product_id! },
              data: {
                stock_quantity: {
                  decrement: item.quantity,
                },
              },
            });
          });
        }
      }

      pendingOrders.push(pendingOrder);
      orderIds.push(pendingOrder.id);
      // If shipping to someone else and recipient phone provided, send magic link SMS
      try {
        const buyerPhone = customer_phone || (deliveryAddress as any)?.phone_number || '';
        const recipientPhone = recipientPhoneFromReq || (deliveryAddress as any)?.phone_number || '';
        if (recipientPhone && recipientPhone !== buyerPhone) {
          // send recipient magic link so they can update the pin if needed
          try {
            await smsService.sendRecipientMagicLink(pendingOrder as any);
          } catch (smErr) {
            console.warn('Failed to send recipient magic link SMS', smErr);
          }
        }
      } catch (e) {
        // ignore
      }
    }

    // 6. Handle payment based on method
    let paymentResult = null;
    let checkoutUrl = null;

    if (payment_method === "paychangu") {
      // Initiate PayChangu payment for total amount
      // We'll link the payment to the first order, but metadata contains all order IDs
      try {
        paymentResult = await paymentService.initiatePayment({
          first_name: customer_first_name,
          last_name: customer_last_name,
          email: customer_email,
          phone: customer_phone,
          amount: totalAmount,
          orderId: pendingOrders[0].id, // Primary order
          metadata: {
            order_ids: orderIds,
            order_numbers: pendingOrders.map(o => o.order_number),
            user_id: userId,
          },
        });

        checkoutUrl = paymentResult.checkoutUrl;

        // Update all orders with the payment reference
        for (const order of pendingOrders) {
          // Create payment record for tracking (linked to each order)
          if (order.id !== pendingOrders[0].id) {
            await prismaClient.payments.create({
              data: {
                order_id: order.id,
                payment_method: "paychangu",
                provider: "paychangu",
                amount: order.total_amount,
                status: "PENDING",
                tx_ref: paymentResult.txRef, // Same tx_ref for all orders in this checkout
                customer_email: customer_email,
                customer_phone: customer_phone,
                customer_first_name: customer_first_name,
                customer_last_name: customer_last_name,
                expired_at: paymentResult.expiresAt,
                metadata: { primary_order_id: pendingOrders[0].id },
              },
            });
          }
        }
      } catch (paymentError: any) {
        // Payment initiation failed - restore stock and revert orders to CART
        console.error("Payment initiation failed:", paymentError);

        for (const order of pendingOrders) {
          // Restore stock
          const orderWithItems = await prismaClient.orders.findUnique({
            where: { id: order.id },
            include: { order_items: true },
          });

          if (orderWithItems) {
            for (const item of orderWithItems.order_items) {
              if (item.shop_product_id) {
                const reason = `Stock restored - Payment initiation failed for ${order.order_number}`;
                const shopProductId = item.shop_product_id; // Capture for type narrowing
                await prismaClient.$transaction(async (tx) => {
                  await tx.$executeRawUnsafe(`SET LOCAL app.stock_change_reason = '${reason.replace(/'/g, "''")}'`);
                  await tx.shop_products.update({
                    where: { id: shopProductId },
                    data: {
                      stock_quantity: {
                        increment: item.quantity,
                      },
                    },
                  });
                });
              }
            }
          }

          // Revert order to cart status
          await prismaClient.orders.update({
            where: { id: order.id },
            data: {
              status: "CART",
              order_number: `CART-${order.id.slice(0, 8)}`, // Temporary cart number
              updated_at: new Date(),
            },
          });
        }

        return errorResponse(
          res,
          "Payment initiation failed. Please try again.",
          paymentError?.response?.data || null,
          500
        );
      }
    } else {
      // COD or bank_transfer - create basic payment record
      for (const order of pendingOrders) {
        await prismaClient.payments.create({
          data: {
            order_id: order.id,
            payment_method: payment_method,
            provider: payment_method,
            amount: order.total_amount,
            status: payment_method === "cod" ? "PENDING" : "PENDING",
            customer_phone: customer_phone,
            customer_email: customer_email,
            customer_first_name: customer_first_name,
            customer_last_name: customer_last_name,
          },
        });
        
        // Auto-generate release code for confirmed orders (COD)
        if (payment_method === "cod") {
          try {
            await orderConfirmationService.generateReleaseCode(order.id);
          } catch (releaseCodeError) {
            console.error(`Failed to generate release code for order ${order.id}:`, releaseCodeError);
            // Don't fail checkout if release code generation fails - can be retried
          }
        }
      }
    }

    // 7. Return response
    return successResponse(
      res,
      payment_method === "paychangu" 
        ? "Order created. Please complete payment." 
        : "Order placed successfully",
      {
        orders: pendingOrders.map((o) => ({
          order_id: (o as any).id,
          order_number: (o as any).order_number,
          shop: (o as any).shops?.name,
          total_amount: Number((o as any).total_amount),
          status: (o as any).status,
          items_count: (o as any).order_items?.length || 0,
          delivery_address: (o as any).user_addresses,
        })),
        total_orders: pendingOrders.length,
        total_amount: totalAmount,
        payment: payment_method === "paychangu" ? {
          tx_ref: paymentResult?.txRef,
          checkout_url: checkoutUrl,
          expires_at: paymentResult?.expiresAt,
          status: "PENDING",
        } : {
          method: payment_method,
          status: "PENDING",
        },
      },
      201
    );
  } catch (error) {
    console.error("Checkout error:", error);
    return errorResponse(res, "Failed to process checkout", 500);
  }
};

/**
 * Get order by ID
 * GET /api/orders/:orderId
 */
export const getOrderById = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { orderId } = req.params;

    const order = await prismaClient.orders.findUnique({
      where: { id: orderId },
      include: {
        order_items: {
          include: {
            shop_products: {
              include: {
                products: true,
              },
            },
          },
        },
        shops: {
          include: {
            users: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
                phone_number: true,
              },
            },
          },
        },
        user_addresses: true,
        users: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            phone_number: true,
          },
        },
        payments: true,
      },
    });

    if (!order) {
      return errorResponse(res, "Order not found", 404);
    }

    // Authorization: buyer, shop owner, or admin
    const isOwner = order.buyer_id === userId;
    const isShopOwner = order.shops.owner_id === userId;
    const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(userRole);

    if (!isOwner && !isShopOwner && !isAdmin) {
      return errorResponse(res, "Unauthorized to view this order", 403);
    }

    // Don't show carts as orders
    if (order.status === "CART") {
      return errorResponse(res, "This is a cart, not an order", 400);
    }

    return successResponse(
      res,
      "Order retrieved successfully",
      {
        order: {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          total_amount: Number(order.total_amount),
          created_at: order.created_at,
          updated_at: order.updated_at,
          shop: {
            id: order.shops.id,
            name: order.shops.name,
            owner: order.shops.users,
          },
          buyer: order.users,
          delivery_address: order.user_addresses,
          items: order.order_items.map((item) => ({
            id: item.id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: Number(item.unit_price),
            total_price: Number(item.quantity) * Number(item.unit_price),
            product_details: item.shop_products?.products,
          })),
          payments: order.payments.map((p) => ({
            id: p.id,
            method: p.payment_method,
            provider: p.provider,
            amount: Number(p.amount),
            status: p.status,
            transaction_id: p.transaction_id,
            created_at: p.created_at,
          })),
        },
      },
      200
    );
  } catch (error) {
    console.error("Get order error:", error);
    return errorResponse(res, "Failed to retrieve order", 500);
  }
};

/**
 * Update delivery pin (lat/lng) and directions.
 * Allowed: authenticated buyer for the order OR valid token provided in body.
 * Not allowed once order status becomes OUT_FOR_DELIVERY.
 */
export const updateDeliveryLocation = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { delivery_lat, delivery_lng, delivery_directions, token } = req.body as any;

    const order = await prismaClient.orders.findUnique({
      where: { id: orderId },
      include: {
        users: true,
        shops: true,
        user_addresses: true,
      },
    });

    if (!order) return errorResponse(res, 'Order not found', 404);

    if (order.status === 'OUT_FOR_DELIVERY') {
      return errorResponse(res, 'Delivery location can no longer be changed', 400);
    }

    const authUserId = (req as any).user?.id;
    const isBuyer = Boolean(authUserId && order.buyer_id === authUserId);
    const tokenMatches = Boolean(token && (order as any).delivery_update_token && token === (order as any).delivery_update_token);

    if (!isBuyer && !tokenMatches) {
      return errorResponse(res, 'Unauthorized to update delivery location', 403);
    }

    // Distance check: prevent moving more than 20km from original checkout anchor
    const origLat = (order as any)?.delivery_lat;
    const origLng = (order as any)?.delivery_lng;
    if (typeof origLat === 'number' && typeof origLng === 'number') {
      const toRad = (v: number) => (v * Math.PI) / 180;
      const R = 6371; // km
      const dLat = toRad(Number(delivery_lat) - Number(origLat));
      const dLon = toRad(Number(delivery_lng) - Number(origLng));
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(Number(origLat))) * Math.cos(toRad(Number(delivery_lat))) * Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distKm = R * c;
      if (distKm > 20) {
        return errorResponse(res, 'New delivery pin is too far from original location', 400);
      }
    }

    const updated = await prismaClient.orders.update({
      where: { id: orderId },
      data: {
        delivery_lat,
        delivery_lng,
        delivery_directions: delivery_directions || undefined,
        updated_at: new Date(),
      },
    } as any);

    // Notify seller about the updated pin
    try {
      const shopObj = order.shops || {} as any;
      const sellerEmail = shopObj.email || (shopObj as any).users?.email || '';
      const sellerPhone = shopObj.phone || (shopObj as any).phone_number || '';
      const buyerName = `${order.users?.first_name || ''} ${order.users?.last_name || ''}`.trim() || 'Buyer';
      const recipientName = (order as any).recipient_name || (order as any).user_addresses?.[0]?.contact_name || buyerName;

      if (sellerEmail) {
        await emailService.sendSellerLocationUpdatedEmail(sellerEmail, {
          orderId: order.id,
          orderNumber: order.order_number,
          shopName: shopObj.name || '',
          buyerName,
          recipientName,
          deliveryLat: delivery_lat,
          deliveryLng: delivery_lng,
          deliveryDirections: delivery_directions || '',
        });
      }

      if (sellerPhone) {
        await smsService.sendSellerLocationUpdateSms(sellerPhone, order.order_number || order.id.slice(0,8));
      }
    } catch (notifyErr) {
      console.error('Failed to notify seller of delivery-location update', notifyErr);
    }

    // If this is a gift (recipient different from buyer), notify recipient via SMS
    try {
      const buyerPhone = (order.users as any)?.phone_number || (order.user_addresses as any)?.[0]?.phone_number || '';
      const recipientPhone = (order as any)?.recipient_phone || (order.user_addresses as any)?.[0]?.phone_number || '';
      if (recipientPhone && recipientPhone !== buyerPhone) {
        const recipientLink = `${process.env.FRONTEND_URL || ''}/orders/${order.id}`;
        await smsService.sendRecipientSms(recipientPhone, `${order.users?.first_name || ''} ${order.users?.last_name || ''}`, order.order_number || order.id.slice(0,8), recipientLink);
      }
    } catch (recErr) {
      console.error('Failed to send recipient SMS for delivery update', recErr);
    }

    return successResponse(res, 'Delivery location updated', { order: updated }, 200);
  } catch (err: any) {
    console.error('updateDeliveryLocation error:', err);
    return errorResponse(res, 'Failed to update delivery location', 500);
  }
};

/**
 * Get my orders (buyer view)
 * GET /api/orders/my-orders
 */
export const getMyOrders = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { page = 1, limit = 10, status, start_date, end_date } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    // Build where clause
    const where: any = {
      buyer_id: userId,
      status: {
        not: "CART", // Exclude carts
      },
    };

    if (status) {
      where.status = status;
    }

    if (start_date || end_date) {
      where.created_at = {};
      if (start_date) {
        where.created_at.gte = new Date(start_date as string);
      }
      if (end_date) {
        where.created_at.lte = new Date(end_date as string);
      }
    }

    const [orders, totalCount] = await Promise.all([
      prismaClient.orders.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: {
          created_at: "desc",
        },
        include: {
          shops: {
            select: {
              id: true,
              name: true,
              city: true,
            },
          },
          order_items: {
            select: {
              id: true,
              product_name: true,
              quantity: true,
              unit_price: true,
            },
          },
          payments: {
            select: {
              id: true,
              payment_method: true,
              status: true,
              amount: true,
            },
          },
        },
      }),
      prismaClient.orders.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / Number(limit));

    return successResponse(
      res,
      "Orders retrieved successfully",
      {
        orders: orders.map((order) => ({
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          total_amount: Number(order.total_amount),
          created_at: order.created_at,
          shop: order.shops,
          items_count: order.order_items.length,
          payment_status: order.payments[0]?.status || "PENDING",
        })),
        pagination: {
          currentPage: Number(page),
          totalPages,
          totalCount,
          limit: Number(limit),
          hasNextPage: Number(page) < totalPages,
          hasPrevPage: Number(page) > 1,
        },
      },
      200
    );
  } catch (error) {
    console.error("Get my orders error:", error);
    return errorResponse(res, "Failed to retrieve orders", 500);
  }
};

/**
 * Get shop orders (seller view)
 * GET /api/orders/shop/:shopId
 */
export const getShopOrders = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { shopId } = req.params;
    const { page = 1, limit = 10, status, start_date, end_date } = req.query;

    // Verify shop ownership or admin
    const shop = await prismaClient.shops.findUnique({
      where: { id: shopId },
    });

    if (!shop) {
      return errorResponse(res, "Shop not found", 404);
    }

    const isOwner = shop.owner_id === userId;
    const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(userRole);

    if (!isOwner && !isAdmin) {
      return errorResponse(res, "Unauthorized to view shop orders", 403);
    }

    const skip = (Number(page) - 1) * Number(limit);

    // Build where clause
    const where: any = {
      shop_id: shopId,
      status: {
        not: "CART", // Exclude carts
      },
    };

    if (status) {
      where.status = status;
    }

    if (start_date || end_date) {
      where.created_at = {};
      if (start_date) {
        where.created_at.gte = new Date(start_date as string);
      }
      if (end_date) {
        where.created_at.lte = new Date(end_date as string);
      }
    }

    const [orders, totalCount] = await Promise.all([
      prismaClient.orders.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: {
          created_at: "desc",
        },
        include: {
          users: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
              phone_number: true,
            },
          },
          user_addresses: true,
          order_items: {
            include: {
              shop_products: {
                include: {
                  products: true,
                },
              },
            },
          },
          payments: true,
        },
      }),
      prismaClient.orders.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / Number(limit));

    return successResponse(
      res,
      "Shop orders retrieved successfully",
      {
        shop: {
          id: shop.id,
          name: shop.name,
        },
        orders: orders.map((order) => ({
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          total_amount: Number(order.total_amount),
          created_at: order.created_at,
          buyer: order.users,
          delivery_address: order.user_addresses,
          items: order.order_items.map((item) => ({
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: Number(item.unit_price),
          })),
          payment: order.payments[0]
            ? {
                method: order.payments[0].payment_method,
                status: order.payments[0].status,
              }
            : null,
        })),
        pagination: {
          currentPage: Number(page),
          totalPages,
          totalCount,
          limit: Number(limit),
          hasNextPage: Number(page) < totalPages,
          hasPrevPage: Number(page) > 1,
        },
      },
      200
    );
  } catch (error) {
    console.error("Get shop orders error:", error);
    return errorResponse(res, "Failed to retrieve shop orders", 500);
  }
};

/**
 * Update order status (seller workflow)
 * PATCH /api/orders/:orderId/status
 */
export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { orderId } = req.params;
    const { status, notes, waybill_number, waybill_photo_url } = req.body as any;

    // Get order with shop info
    const order = await prismaClient.orders.findUnique({
      where: { id: orderId },
      include: {
        shops: true,
      },
    });

    if (!order) {
      return errorResponse(res, "Order not found", 404);
    }

    // Authorization: shop owner or admin
    const isShopOwner = order.shops.owner_id === userId;
    const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(userRole);

    if (!isShopOwner && !isAdmin) {
      return errorResponse(res, "Unauthorized to update this order", 403);
    }

    // If this is a depot/shipment, require waybill on READY_FOR_PICKUP (seller marks as shipped)
    if (status === 'READY_FOR_PICKUP' && (order as any).depot_name) {
      if (!waybill_number && !waybill_photo_url) {
        return errorResponse(res, 'Depot shipments require a waybill number or a photo of the receipt before marking as READY_FOR_PICKUP', 400);
      }
    }

    // Validate status transitions
    const validTransitions: Record<string, string[]> = {
      CONFIRMED: ["PREPARING", "CANCELLED"],
      PREPARING: ["READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "CANCELLED"],
      READY_FOR_PICKUP: ["OUT_FOR_DELIVERY", "DELIVERED"],
      OUT_FOR_DELIVERY: ["DELIVERED"],
      DELIVERED: [], // Final state
      CANCELLED: [], // Final state
    };

    const currentStatus = order.status || "CONFIRMED";
    const allowedStatuses = validTransitions[currentStatus] || [];

    if (!allowedStatuses.includes(status)) {
      return errorResponse(
        res,
        `Cannot transition from ${currentStatus} to ${status}`,
        {
          current_status: currentStatus,
          allowed_statuses: allowedStatuses,
        },
        400
      );
    }

    // Update order status (include waybill fields when provided)
    const updateData: any = {
      status: status,
      updated_at: new Date(),
    };
    if (waybill_number) updateData.waybill_number = waybill_number;
    if (waybill_photo_url) updateData.waybill_photo_url = waybill_photo_url;

    const updatedOrder = await prismaClient.orders.update({
      where: { id: orderId },
      data: updateData,
      include: {
        shops: true,
        users: {
          select: {
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
    });

    // Create order message notification
    const messageTypes: Record<string, string> = {
      PREPARING: "ORDER_PREPARING",
      READY_FOR_PICKUP: "ORDER_READY",
      OUT_FOR_DELIVERY: "ORDER_SHIPPED",
      DELIVERED: "ORDER_DELIVERED",
      CANCELLED: "ORDER_CANCELLED",
    };

    if (messageTypes[status]) {
      await prismaClient.order_messages.create({
        data: {
          order_id: orderId,
          recipient_type: "CUSTOMER",
          message_type: messageTypes[status],
          channel: "EMAIL",
          subject: `Order ${updatedOrder.order_number} - Status Update`,
          body:
            notes ||
            `Your order status has been updated to ${status.replace(/_/g, " ")}`,
          is_sent: false,
        },
      });
    }

    return successResponse(
      res,
      "Order status updated successfully",
      {
        order: {
          id: updatedOrder.id,
          order_number: updatedOrder.order_number,
          previous_status: currentStatus,
          current_status: updatedOrder.status,
          updated_at: updatedOrder.updated_at,
        },
      },
      200
    );
  } catch (error) {
    console.error("Update order status error:", error);
    return errorResponse(res, "Failed to update order status", 500);
  }
};

/**
 * Upload waybill photo for an order (seller action).
 * POST /api/orders/:orderId/waybill
 * Protected: shop owner or admin
 */
export const uploadWaybill = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { orderId } = req.params;
    const waybill_number = (req as any).body?.waybill_number || undefined;

    const order = await prismaClient.orders.findUnique({
      where: { id: orderId },
      include: { shops: true, users: true }
    });

    if (!order) return errorResponse(res, 'Order not found', 404);

    // Authorization: only shop owner or admins can upload waybill
    const isShopOwner = order.shops?.owner_id === userId;
    const isAdmin = (req as any).user && ["ADMIN", "SUPER_ADMIN"].includes((req as any).user.role);
    if (!isShopOwner && !isAdmin) return errorResponse(res, 'Unauthorized', 403);

    // Expect multer `uploadSingle` to have been used; file buffer is in req.file.buffer
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file || !file.buffer) return errorResponse(res, 'No waybill image provided', 400);

    // Upload to Cloudinary under 'waybills/{shopId}/{orderId}'
    const folder = `waybills/${order.shops?.id}/${order.id}`;
    const uploadRes = await CloudinaryService.uploadImage(file.buffer, folder);
    if (!uploadRes.success || !uploadRes.url) {
      return errorResponse(res, 'Failed to upload waybill image', 500);
    }

    // Save waybill url and number, and set status to READY_FOR_PICKUP (if appropriate)
    const updateData: any = {
      waybill_photo_url: uploadRes.url,
      waybill_number: waybill_number || undefined,
      updated_at: new Date()
    };

    const updated = await prismaClient.orders.update({
      where: { id: orderId },
      data: updateData,
    } as any);

    // Notify buyer/recipient that waybill has been uploaded
    try {
      const buyerEmail = (order.users as any)?.email;
      if (buyerEmail) {
        await emailService.sendNotification(buyerEmail, {
          userName: `${(order.users as any)?.first_name || ''} ${(order.users as any)?.last_name || ''}`.trim() || 'Customer',
          title: `Waybill uploaded for order #${order.order_number}`,
          message: `Waybill has been uploaded by the seller. Waybill number: ${waybill_number || 'N/A'}. You can view details in your orders.`,
          ctaText: 'View Order',
          ctaUrl: `${process.env.FRONTEND_URL || emailService ? emailService : ''}/orders/${order.id}`,
          type: 'info'
        });
      }
    } catch (notifyErr) {
      console.warn('Failed to notify buyer about waybill upload', notifyErr);
    }

    return successResponse(res, 'Waybill uploaded', { order: updated }, 200);
  } catch (err: any) {
    console.error('uploadWaybill error:', err);
    return errorResponse(res, 'Failed to upload waybill', 500);
  }
};

/**
 * Cancel order (buyer or seller)
 * POST /api/orders/:orderId/cancel
 */
export const cancelOrder = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { orderId } = req.params;
    const { reason } = req.body;

    // Get order
    const order = await prismaClient.orders.findUnique({
      where: { id: orderId },
      include: {
        shops: true,
        order_items: {
          include: {
            shop_products: true,
          },
        },
        payments: true,
      },
    });

    if (!order) {
      return errorResponse(res, "Order not found", 404);
    }

    // Authorization: buyer, shop owner, or admin
    const isBuyer = order.buyer_id === userId;
    const isShopOwner = order.shops.owner_id === userId;
    const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(userRole);

    if (!isBuyer && !isShopOwner && !isAdmin) {
      return errorResponse(res, "Unauthorized to cancel this order", 403);
    }

    // Can only cancel if not yet delivered
    if (["DELIVERED", "CANCELLED", "REFUNDED"].includes(order.status || "")) {
      return errorResponse(
        res,
        `Cannot cancel order with status ${order.status}`,
        400
      );
    }

    // Update order status
    const cancelledOrder = await prismaClient.orders.update({
      where: { id: orderId },
      data: {
        status: "CANCELLED",
        updated_at: new Date(),
      },
    });

    // Restore stock for cancelled order (trigger handles logging)
    for (const item of order.order_items) {
      if (item.shop_products) {
        const reason = `Order cancelled - ${order.order_number}`;
        await prismaClient.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL app.stock_change_reason = '${reason.replace(/'/g, "''")}'`);
          await tx.shop_products.update({
            where: { id: item.shop_product_id! },
            data: {
              stock_quantity: {
                increment: item.quantity,
              },
            },
          });
        });
      }
    }

    // Update payment status if exists
    if (order.payments.length > 0) {
      await prismaClient.payments.update({
        where: { id: order.payments[0].id },
        data: {
          status: "CANCELLED",
          updated_at: new Date(),
        },
      });
    }

    // Create cancellation notification
    await prismaClient.order_messages.create({
      data: {
        order_id: orderId,
        recipient_type: isBuyer ? "SHOP" : "CUSTOMER",
        message_type: "ORDER_CANCELLED",
        channel: "EMAIL",
        subject: `Order ${order.order_number} Cancelled`,
        body: `Cancellation reason: ${reason}`,
        is_sent: false,
      },
    });

    return successResponse(
      res,
      "Order cancelled successfully",
      {
        order: {
          id: cancelledOrder.id,
          order_number: cancelledOrder.order_number,
          status: cancelledOrder.status,
          cancelled_by: isBuyer
            ? "buyer"
            : isShopOwner
            ? "seller"
            : "admin",
          reason: reason,
          stock_restored: true,
        },
      },
      200
    );
  } catch (error) {
    console.error("Cancel order error:", error);
    return errorResponse(res, "Failed to cancel order", 500);
  }
};

/**
 * Get order tracking timeline/status history
 * GET /api/orders/:orderId/tracking
 */
export const getOrderTracking = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { orderId } = req.params;

    const order = await prismaClient.orders.findUnique({
      where: { id: orderId },
      include: {
        shops: true,
        user_addresses: true,
        order_messages: {
          orderBy: {
            created_at: 'desc'
          }
        }
      }
    });

    if (!order) {
      return errorResponse(res, "Order not found", 404);
    }

    // Authorization
    const isBuyer = order.buyer_id === userId;
    const isShopOwner = order.shops.owner_id === userId;
    const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(userRole);

    if (!isBuyer && !isShopOwner && !isAdmin) {
      return errorResponse(res, "Unauthorized to view this order", 403);
    }

    // Build status timeline
    const timeline = [
      {
        status: "CONFIRMED",
        label: "Order Confirmed",
        completed: true,
        timestamp: order.created_at,
      },
    ];

    const statusOrder = [
      "PREPARING",
      "READY_FOR_PICKUP",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ];

    const currentStatusIndex = statusOrder.indexOf(order.status || "CONFIRMED");

    statusOrder.forEach((status, index) => {
      timeline.push({
        status,
        label: status.replace(/_/g, " "),
        completed: index <= currentStatusIndex,
        timestamp: index <= currentStatusIndex ? order.updated_at : null,
      });
    });

    return successResponse(
      res,
      "Order tracking retrieved successfully",
      {
        order: {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          created_at: order.created_at,
          updated_at: order.updated_at,
        },
        delivery_address: order.user_addresses,
        timeline,
        notifications: order.order_messages.map((msg) => ({
          type: msg.message_type,
          subject: msg.subject,
          created_at: msg.created_at,
        })),
      },
      200
    );
  } catch (error) {
    console.error("Get order tracking error:", error);
    return errorResponse(res, "Failed to retrieve order tracking", 500);
  }
};

/**
 * Get all orders (admin only)
 * GET /api/orders/admin/all
 */
export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      start_date,
      end_date,
      shop_id,
      search,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {
      status: {
        not: "CART",
      },
    };

    if (status) {
      where.status = status;
    }

    if (shop_id) {
      where.shop_id = shop_id;
    }

    if (start_date || end_date) {
      where.created_at = {};
      if (start_date) {
        where.created_at.gte = new Date(start_date as string);
      }
      if (end_date) {
        where.created_at.lte = new Date(end_date as string);
      }
    }

    if (search) {
      where.OR = [
        {
          order_number: {
            contains: search as string,
            mode: "insensitive",
          },
        },
        {
          users: {
            OR: [
              {
                first_name: {
                  contains: search as string,
                  mode: "insensitive",
                },
              },
              {
                last_name: {
                  contains: search as string,
                  mode: "insensitive",
                },
              },
              {
                email: {
                  contains: search as string,
                  mode: "insensitive",
                },
              },
            ],
          },
        },
      ];
    }

    const [orders, totalCount] = await Promise.all([
      prismaClient.orders.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: {
          created_at: "desc",
        },
        include: {
          users: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          },
          shops: {
            select: {
              id: true,
              name: true,
              city: true,
            },
          },
          order_items: {
            select: {
              id: true,
              product_name: true,
              quantity: true,
              unit_price: true,
            },
          },
          payments: {
            select: {
              payment_method: true,
              status: true,
              amount: true,
            },
          },
        },
      }),
      prismaClient.orders.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / Number(limit));

    return successResponse(
      res,
      "Orders retrieved successfully",
      {
        orders: orders.map((order) => ({
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          total_amount: Number(order.total_amount),
          created_at: order.created_at,
          buyer: order.users,
          shop: order.shops,
          items_count: order.order_items.length,
          payment_status: order.payments[0]?.status || "PENDING",
        })),
        pagination: {
          currentPage: Number(page),
          totalPages,
          totalCount,
          limit: Number(limit),
          hasNextPage: Number(page) < totalPages,
          hasPrevPage: Number(page) > 1,
        },
      },
      200
    );
  } catch (error) {
    console.error("Get all orders error:", error);
    return errorResponse(res, "Failed to retrieve orders", 500);
  }
};

/**
 * Get order statistics
 * GET /api/orders/stats (for own shops - seller)
 * GET /api/orders/admin/stats (for all orders - admin)
 */
export const getOrderStats = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { shop_id, start_date, end_date } = req.query;

    const where: any = {
      status: {
        not: "CART",
      },
    };

    // If shop_id provided, verify ownership or admin
    if (shop_id) {
      const shop = await prismaClient.shops.findUnique({
        where: { id: shop_id as string },
      });

      if (!shop) {
        return errorResponse(res, "Shop not found", 404);
      }

      const isOwner = shop.owner_id === userId;
      const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(userRole);

      if (!isOwner && !isAdmin) {
        return errorResponse(res, "Unauthorized to view shop statistics", 403);
      }

      where.shop_id = shop_id;
    } else if (!["ADMIN", "SUPER_ADMIN"].includes(userRole)) {
      // Non-admin without shop_id - get stats for all their shops
      const userShops = await prismaClient.shops.findMany({
        where: { owner_id: userId },
        select: { id: true },
      });

      where.shop_id = {
        in: userShops.map((s) => s.id),
      };
    }

    if (start_date || end_date) {
      where.created_at = {};
      if (start_date) {
        where.created_at.gte = new Date(start_date as string);
      }
      if (end_date) {
        where.created_at.lte = new Date(end_date as string);
      }
    }

    const [totalOrders, ordersByStatus, revenueData] = await Promise.all([
      prismaClient.orders.count({ where }),
      prismaClient.orders.groupBy({
        by: ["status"],
        where,
        _count: true,
      }),
      prismaClient.orders.aggregate({
        where,
        _sum: {
          total_amount: true,
        },
      }),
    ]);

    const statusBreakdown = ordersByStatus.reduce((acc, item) => {
      acc[item.status || "UNKNOWN"] = item._count;
      return acc;
    }, {} as Record<string, number>);

    return successResponse(
      res,
      "Order statistics retrieved successfully",
      {
        total_orders: totalOrders,
        total_revenue: Number(revenueData._sum.total_amount || 0),
        status_breakdown: statusBreakdown,
        average_order_value:
          totalOrders > 0
            ? Number(revenueData._sum.total_amount || 0) / totalOrders
            : 0,
      },
      200
    );
  } catch (error) {
    console.error("Get order stats error:", error);
    return errorResponse(res, "Failed to retrieve order statistics", 500);
  }
};

/**
 * Verify release code - Seller confirms delivery
 * POST /api/orders/:orderId/verify-release-code
 * 
 * When buyer receives the order and gives the release code to seller,
 * seller enters this code to confirm delivery and receive payment.
 */
export const verifyReleaseCode = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { orderId } = req.params;
    const { release_code } = req.body;

    if (!release_code) {
      return errorResponse(res, "Release code is required", 400);
    }

    // Get the order to verify shop ownership
    const order = await prismaClient.orders.findUnique({
      where: { id: orderId },
      include: {
        shops: {
          select: {
            id: true,
            owner_id: true,
            name: true,
          }
        }
      }
    });

    if (!order) {
      return errorResponse(res, "Order not found", 404);
    }

    // Only shop owner (seller) or admin can verify
    const isShopOwner = order.shops?.owner_id === userId;
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

    if (!isShopOwner && !isAdmin) {
      return errorResponse(res, "Only the shop owner can verify release codes", 403);
    }

    // Use the service to verify
    const result = await orderConfirmationService.verifyReleaseCode(
      orderId,
      release_code,
      order.shop_id
    );

    if (!result.success) {
      const statusCode = result.errorCode === 'INVALID_CODE' || result.errorCode === 'WRONG_SHOP' ? 400 
                       : result.errorCode === 'EXPIRED' ? 410 
                       : result.errorCode === 'ALREADY_VERIFIED' ? 409 
                       : 400;
      return errorResponse(res, result.error || "Verification failed", statusCode);
    }

    return successResponse(
      res,
      "Delivery confirmed! Payment has been credited to your wallet.",
      {
        order_id: orderId,
        order_number: result.order?.order_number,
        seller_payout: Number(result.sellerPayout),
        new_wallet_balance: Number(result.newWalletBalance),
        verified_at: result.order?.release_code_verified_at,
      },
      200
    );
  } catch (error) {
    console.error("Verify release code error:", error);
    return errorResponse(res, "Failed to verify release code", 500);
  }
};

/**
 * Get release code for buyer - Buyer views their release code
 * GET /api/orders/:orderId/release-code
 * 
 * Only the buyer can see their release code
 */
export const getReleaseCode = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { orderId } = req.params;

    const order = await prismaClient.orders.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        order_number: true,
        buyer_id: true,
        status: true,
        release_code: true,
        release_code_status: true,
        release_code_expires_at: true,
        release_code_verified_at: true,
        shops: {
          select: {
            name: true,
          }
        }
      }
    });

    if (!order) {
      return errorResponse(res, "Order not found", 404);
    }

    // Only the buyer can view their release code
    if (order.buyer_id !== userId) {
      return errorResponse(res, "You can only view your own release codes", 403);
    }

    // Check if release code exists
    if (!order.release_code) {
      return errorResponse(res, "Release code not yet generated. It will be available after payment confirmation.", 400);
    }

    // Format code for display (e.g., "X7K-9M2")
    const formattedCode = order.release_code.length === 6 
      ? `${order.release_code.substring(0, 3)}-${order.release_code.substring(3)}`
      : order.release_code;

    return successResponse(
      res,
      "Release code retrieved successfully",
      {
        order_id: order.id,
        order_number: order.order_number,
        shop_name: order.shops?.name,
        release_code: formattedCode,
        status: order.release_code_status,
        expires_at: order.release_code_expires_at,
        verified_at: order.release_code_verified_at,
        instructions: order.release_code_status === 'PENDING' 
          ? "Give this code to the seller ONLY after you have received and verified your order."
          : order.release_code_status === 'VERIFIED'
          ? "This code has been verified. Thank you for your purchase!"
          : "This code has expired.",
      },
      200
    );
  } catch (error) {
    console.error("Get release code error:", error);
    return errorResponse(res, "Failed to retrieve release code", 500);
  }
};

/**
 * Generate release code (Admin/System use)
 * POST /api/orders/:orderId/generate-release-code
 * 
 * Normally called automatically when payment is confirmed,
 * but admins can manually trigger if needed.
 */
export const generateReleaseCode = async (req: Request, res: Response) => {
  try {
    const userRole = req.user!.role;
    const { orderId } = req.params;

    // Only admins can manually generate
    if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
      return errorResponse(res, "Only admins can manually generate release codes", 403);
    }

    const result = await orderConfirmationService.generateReleaseCode(orderId);

    if (!result.success) {
      return errorResponse(res, result.error || "Failed to generate release code", 400);
    }

    return successResponse(
      res,
      "Release code generated successfully",
      {
        order_id: orderId,
        release_code: result.code,
        expires_at: result.expiresAt,
      },
      200
    );
  } catch (error) {
    console.error("Generate release code error:", error);
    return errorResponse(res, "Failed to generate release code", 500);
  }
};
