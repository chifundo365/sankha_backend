import { z } from "zod";

/**
 * Schema for adding an item to cart
 * Requires shop_product_id and quantity
 */
export const addToCartSchema = z.object({
  body: z.object({
    shop_product_id: z
      .string({ message: "Shop product ID is required" })
      .uuid("Invalid shop product ID format"),
    quantity: z
      .number({ message: "Quantity is required" })
      .int("Quantity must be an integer")
      .min(1, "Quantity must be at least 1")
      .max(100, "Maximum quantity per item is 100")
  })
});

/**
 * Schema for updating cart item quantity
 * Only allows updating the quantity field
 */
export const updateCartItemSchema = z.object({
  params: z.object({
    itemId: z.string().uuid("Invalid cart item ID format")
  }),
  body: z.object({
    quantity: z
      .number({ message: "Quantity is required" })
      .int("Quantity must be an integer")
      .min(1, "Quantity must be at least 1")
      .max(100, "Maximum quantity per item is 100")
  })
});

/**
 * Schema for removing an item from cart
 * Only requires the item ID in params
 */
export const removeFromCartSchema = z.object({
  params: z.object({
    itemId: z.string().uuid("Invalid cart item ID format")
  })
});

/**
 * Schema for getting cart summary
 * No body params required - uses authenticated user's ID
 */
export const getCartSchema = z.object(
  {
    // No params needed - cart is tied to authenticated user
  }
);

/**
 * Schema for clearing entire cart
 * No params needed - uses authenticated user's ID
 */
export const clearCartSchema = z.object(
  {
    // No params needed - deletes all items in user's cart
  }
);

// Type exports for TypeScript
export type AddToCartInput = z.infer<typeof addToCartSchema>["body"];
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type RemoveFromCartInput = z.infer<typeof removeFromCartSchema>;
