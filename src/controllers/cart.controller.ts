import { Request, Response } from "express";
import prismaClient from "../prismaClient";
import { successResponse, errorResponse } from "../utils/response";

/**
 * Get or create active cart for user
 * A cart is an order with status 'CART' and no order_number
 */
const getOrCreateCart = async (userId: string, shopId: string) => {
  // First, try to find existing cart for this shop
  let cart = await prismaClient.orders.findFirst({
    where: {
      buyer_id: userId,
      shop_id: shopId,
      status: "CART",
    },
    include: {
      order_items: {
        include: {
          shop_products: {
            include: {
              products: true,
              shops: true,
            },
          },
        },
      },
    },
  });

  // If no cart exists, create one
  if (!cart) {
    cart = await prismaClient.orders.create({
      data: {
        buyer_id: userId,
        shop_id: shopId,
        status: "CART",
        total_amount: 0,
        order_number: `CART-${userId.substring(0, 8)}-${shopId.substring(0, 8)}`, // Temporary unique cart ID
      },
      include: {
        order_items: {
          include: {
            shop_products: {
              include: {
                products: true,
                shops: true,
              },
            },
          },
        },
      },
    });
  }

  return cart;
};

/**
 * Calculate cart total from items
 */
const calculateCartTotal = (items: any[]) => {
  return items.reduce((total, item) => {
    return total + Number(item.quantity) * Number(item.unit_price);
  }, 0);
};

/**
 * Add item to cart
 * POST /api/cart
 */
export const addToCart = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { shop_product_id, quantity } = req.body;

    // 1. Verify shop product exists and is available
    const shopProduct = await prismaClient.shop_products.findUnique({
      where: { id: shop_product_id },
      include: {
        products: true,
        shops: true,
      },
    });

    if (!shopProduct) {
      return errorResponse(res, "Shop product not found", 404);
    }

    if (!shopProduct.is_available) {
      return errorResponse(res, "This product is currently unavailable", 400);
    }

    // 2. Check stock availability
    if (shopProduct.stock_quantity < quantity) {
      return errorResponse(
        res,
        `Insufficient stock. Only ${shopProduct.stock_quantity} available`,
        400
      );
    }

    // 3. Get or create cart for this shop
    const cart = await getOrCreateCart(userId, shopProduct.shop_id);

    // 4. Check if item already exists in cart
    const existingItem = await prismaClient.order_items.findFirst({
      where: {
        order_id: cart.id,
        shop_product_id: shop_product_id,
      },
    });

    let cartItem;

    if (existingItem) {
      // Update quantity if item exists
      const newQuantity = existingItem.quantity + quantity;

      // Check stock for new total quantity
      if (shopProduct.stock_quantity < newQuantity) {
        return errorResponse(
          res,
          `Cannot add ${quantity} more. Maximum available: ${
            shopProduct.stock_quantity - existingItem.quantity
          }`,
          400
        );
      }

      cartItem = await prismaClient.order_items.update({
        where: { id: existingItem.id },
        data: {
          quantity: newQuantity,
        },
        include: {
          shop_products: {
            include: {
              products: true,
            },
          },
        },
      });
    } else {
      // Add new item to cart
      cartItem = await prismaClient.order_items.create({
        data: {
          order_id: cart.id,
          shop_product_id: shop_product_id,
          product_name: shopProduct.products.name,
          quantity: quantity,
          unit_price: shopProduct.price,
        },
        include: {
          shop_products: {
            include: {
              products: true,
            },
          },
        },
      });
    }

    // 5. Update cart total
    const updatedCart = await prismaClient.orders.findUnique({
      where: { id: cart.id },
      include: {
        order_items: true,
      },
    });

    const newTotal = calculateCartTotal(updatedCart!.order_items);

    await prismaClient.orders.update({
      where: { id: cart.id },
      data: {
        total_amount: newTotal,
      },
    });

    return successResponse(
      res,
      existingItem ? "Cart item updated successfully" : "Item added to cart",
      {
        item: cartItem,
        cart_total: newTotal,
      },
      200
    );
  } catch (error) {
    console.error("Add to cart error:", error);
    return errorResponse(res, "Failed to add item to cart", 500);
  }
};

/**
 * Get user's cart (all cart items from all shops)
 * GET /api/cart
 */
export const getCart = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get all carts (user can have carts from multiple shops)
    const carts = await prismaClient.orders.findMany({
      where: {
        buyer_id: userId,
        status: "CART",
      },
      include: {
        shops: {
          select: {
            id: true,
            name: true,
            city: true,
            delivery_enabled: true,
          },
        },
        order_items: {
          include: {
            shop_products: {
              include: {
                products: {
                  select: {
                    id: true,
                    name: true,
                    brand: true,
                    images: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Calculate totals
    const cartSummary = {
      carts: carts.map((cart) => ({
        cart_id: cart.id,
        shop: cart.shops,
        items: cart.order_items.map((item) => ({
          id: item.id,
          shop_product_id: item.shop_product_id,
          product: item.shop_products?.products,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: Number(item.unit_price),
          total_price: Number(item.quantity) * Number(item.unit_price),
          stock_available: item.shop_products?.stock_quantity || 0,
          is_available: item.shop_products?.is_available || false,
        })),
        subtotal: Number(cart.total_amount),
        item_count: cart.order_items.length,
      })),
      total_items: carts.reduce(
        (sum, cart) => sum + cart.order_items.length,
        0
      ),
      total_amount: carts.reduce(
        (sum, cart) => sum + Number(cart.total_amount),
        0
      ),
      shop_count: carts.length,
    };

    return successResponse(res, "Cart retrieved successfully", cartSummary, 200);
  } catch (error) {
    console.error("Get cart error:", error);
    return errorResponse(res, "Failed to retrieve cart", 500);
  }
};

/**
 * Update cart item quantity
 * PUT /api/cart/items/:itemId
 */
export const updateCartItem = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { itemId } = req.params;
    const { quantity } = req.body;

    // 1. Find cart item and verify ownership
    const cartItem = await prismaClient.order_items.findUnique({
      where: { id: itemId },
      include: {
        orders: true,
        shop_products: true,
      },
    });

    if (!cartItem) {
      return errorResponse(res, "Cart item not found", 404);
    }

    // Verify this item belongs to user's cart
    if (cartItem.orders.buyer_id !== userId) {
      return errorResponse(res, "Unauthorized to modify this cart item", 403);
    }

    // Verify it's a cart item (not a confirmed order)
    if (cartItem.orders.status !== "CART") {
      return errorResponse(res, "Cannot modify confirmed order items", 400);
    }

    // 2. Check stock availability
    if (
      cartItem.shop_products &&
      cartItem.shop_products.stock_quantity < quantity
    ) {
      return errorResponse(
        res,
        `Insufficient stock. Only ${cartItem.shop_products.stock_quantity} available`,
        400
      );
    }

    // 3. Update item quantity
    const updatedItem = await prismaClient.order_items.update({
      where: { id: itemId },
      data: { quantity },
      include: {
        shop_products: {
          include: {
            products: true,
          },
        },
      },
    });

    // 4. Recalculate cart total
    const cart = await prismaClient.orders.findUnique({
      where: { id: cartItem.order_id },
      include: { order_items: true },
    });

    const newTotal = calculateCartTotal(cart!.order_items);

    await prismaClient.orders.update({
      where: { id: cartItem.order_id },
      data: { total_amount: newTotal },
    });

    return successResponse(
      res,
      "Cart item updated successfully",
      {
        item: updatedItem,
        cart_total: newTotal,
      },
      200
    );
  } catch (error) {
    console.error("Update cart item error:", error);
    return errorResponse(res, "Failed to update cart item", 500);
  }
};

/**
 * Remove item from cart
 * DELETE /api/cart/items/:itemId
 */
export const removeFromCart = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { itemId } = req.params;

    // 1. Find cart item and verify ownership
    const cartItem = await prismaClient.order_items.findUnique({
      where: { id: itemId },
      include: {
        orders: true,
      },
    });

    if (!cartItem) {
      return errorResponse(res, "Cart item not found", 404);
    }

    // Verify ownership
    if (cartItem.orders.buyer_id !== userId) {
      return errorResponse(res, "Unauthorized to remove this cart item", 403);
    }

    // Verify it's a cart item
    if (cartItem.orders.status !== "CART") {
      return errorResponse(res, "Cannot remove items from confirmed orders", 400);
    }

    const orderId = cartItem.order_id;

    // 2. Delete the item
    await prismaClient.order_items.delete({
      where: { id: itemId },
    });

    // 3. Check if cart is now empty
    const remainingItems = await prismaClient.order_items.count({
      where: { order_id: orderId },
    });

    if (remainingItems === 0) {
      // Delete empty cart
      await prismaClient.orders.delete({
        where: { id: orderId },
      });

      return successResponse(
        res,
        "Item removed and cart deleted (was empty)",
        { cart_deleted: true },
        200
      );
    }

    // 4. Recalculate cart total
    const cart = await prismaClient.orders.findUnique({
      where: { id: orderId },
      include: { order_items: true },
    });

    const newTotal = calculateCartTotal(cart!.order_items);

    await prismaClient.orders.update({
      where: { id: orderId },
      data: { total_amount: newTotal },
    });

    return successResponse(
      res,
      "Item removed from cart",
      {
        cart_total: newTotal,
        items_remaining: remainingItems,
      },
      200
    );
  } catch (error) {
    console.error("Remove from cart error:", error);
    return errorResponse(res, "Failed to remove item from cart", 500);
  }
};

/**
 * Clear entire cart (all items from all shops)
 * DELETE /api/cart
 */
export const clearCart = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Delete all cart orders for user (cascade will delete order_items)
    const result = await prismaClient.orders.deleteMany({
      where: {
        buyer_id: userId,
        status: "CART",
      },
    });

    return successResponse(
      res,
      `Cart cleared successfully (${result.count} cart(s) deleted)`,
      { carts_cleared: result.count },
      200
    );
  } catch (error) {
    console.error("Clear cart error:", error);
    return errorResponse(res, "Failed to clear cart", 500);
  }
};
