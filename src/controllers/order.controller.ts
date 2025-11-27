import { Request, Response } from "express";
import prismaClient from "../prismaClient";
import { successResponse, errorResponse } from "../utils/response";

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
 * Checkout - Convert cart to confirmed order
 * POST /api/orders/checkout
 */
export const checkout = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { delivery_address_id, payment_method, provider, customer_phone } =
      req.body;

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
    const confirmedOrders = [];

    for (const cart of carts) {
      // Generate order number
      const orderNumber = await generateOrderNumber();

      // Update cart to confirmed order
      const confirmedOrder = await prismaClient.orders.update({
        where: { id: cart.id },
        data: {
          order_number: orderNumber,
          status: "CONFIRMED",
          delivery_address_id: delivery_address_id,
          updated_at: new Date(),
        },
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

      // 5. Reduce stock for each item
      for (const item of cart.order_items) {
        if (item.shop_products) {
          // Reduce stock
          await prismaClient.shop_products.update({
            where: { id: item.shop_product_id! },
            data: {
              stock_quantity: {
                decrement: item.quantity,
              },
            },
          });

          // Log stock change
          await prismaClient.shop_products_log.create({
            data: {
              shop_product_id: item.shop_product_id!,
              change_type: "DECREASE",
              change_qty: item.quantity,
              reason: `Order placed - ${orderNumber}`,
            },
          });
        }
      }

      // 6. Create payment record
      const payment = await prismaClient.payments.create({
        data: {
          order_id: confirmedOrder.id,
          payment_method: payment_method,
          provider: provider,
          amount: confirmedOrder.total_amount,
          status: "PENDING",
          customer_phone: customer_phone,
        },
      });

      confirmedOrders.push({
        order: confirmedOrder,
        payment: payment,
      });
    }

    return successResponse(
      res,
      "Order placed successfully",
      {
        orders: confirmedOrders.map((o) => ({
          order_id: o.order.id,
          order_number: o.order.order_number,
          shop: o.order.shops.name,
          total_amount: Number(o.order.total_amount),
          status: o.order.status,
          items_count: o.order.order_items.length,
          delivery_address: o.order.user_addresses,
          payment: {
            id: o.payment.id,
            method: o.payment.payment_method,
            status: o.payment.status,
            amount: Number(o.payment.amount),
          },
        })),
        total_orders: confirmedOrders.length,
        total_amount: confirmedOrders.reduce(
          (sum, o) => sum + Number(o.order.total_amount),
          0
        ),
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
    const { status, notes } = req.body;

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

    // Update order status
    const updatedOrder = await prismaClient.orders.update({
      where: { id: orderId },
      data: {
        status: status,
        updated_at: new Date(),
      },
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

    // Restore stock for cancelled order
    for (const item of order.order_items) {
      if (item.shop_products) {
        await prismaClient.shop_products.update({
          where: { id: item.shop_product_id! },
          data: {
            stock_quantity: {
              increment: item.quantity,
            },
          },
        });

        // Log stock restoration
        await prismaClient.shop_products_log.create({
          data: {
            shop_product_id: item.shop_product_id!,
            change_type: "INCREASE",
            change_qty: item.quantity,
            reason: `Order cancelled - ${order.order_number}`,
          },
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
