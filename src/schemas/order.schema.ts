import { z } from "zod";

/**
 * Schema for checkout - converting cart to order
 */
export const checkoutSchema = z.object({
  body: z.object({
    delivery_address_id: z
      .string({ message: "Delivery address ID is required" })
      .uuid("Invalid delivery address ID format"),
    payment_method: z
      .enum(["paychangu", "cod", "bank_transfer"], { message: "Payment method must be paychangu, cod, or bank_transfer" }),
    customer_email: z
      .string({ message: "Customer email is required" })
      .email("Invalid email format"),
    customer_phone: z
      .string({ message: "Customer phone is required" })
      .min(10, "Phone number must be at least 10 characters")
      .max(20, "Phone number must not exceed 20 characters"),
    customer_first_name: z
      .string({ message: "First name is required" })
      .min(1, "First name cannot be empty")
      .max(100, "First name must not exceed 100 characters"),
    customer_last_name: z
      .string({ message: "Last name is required" })
      .min(1, "Last name cannot be empty")
      .max(100, "Last name must not exceed 100 characters")
    ,
    // Optional: ship to someone else details (third-party delivery)
    ship_to_other: z.boolean().optional(),
    recipient_name: z.string().min(1).max(255).optional(),
    recipient_phone: z
      .string()
      .regex(/^\+?265\d{7,9}$/, "Recipient phone must be a Malawi number starting with +265")
      .optional(),
    // Logistics fork: HOME vs DEPOT
    logistics_path: z.enum(["HOME", "DEPOT"]).optional(),
    // Home delivery anchor
    delivery_lat: z.number().min(-90).max(90).optional(),
    delivery_lng: z.number().min(-180).max(180).optional(),
    delivery_directions: z.string().max(2000).optional(),
    // Depot / inter-city pickup fields
    depot_name: z.string().max(255).optional(),
    depot_lat: z.number().min(-90).max(90).optional(),
    depot_lng: z.number().min(-180).max(180).optional(),
    preferred_carrier_details: z.string().max(2000).optional(),
    package_label_text: z.string().max(255).optional()
   })
   .refine((body) => {
     // If shipping to someone else, ensure recipient phone is provided
     if (body.ship_to_other) {
       const hasPhone = Boolean(body.recipient_phone);
       if (!hasPhone) return false;
     }
     // Enforce logistics path requirements
     const path = body.logistics_path || 'HOME';
     if (path === 'HOME') {
       const hasLat = typeof body.delivery_lat === 'number';
       const hasLng = typeof body.delivery_lng === 'number';
       return hasLat && hasLng;
     }
     if (path === 'DEPOT') {
       const hasDepot = Boolean(body.depot_name);
       const hasDepotCoords = typeof body.depot_lat === 'number' && typeof body.depot_lng === 'number';
       return hasDepot && hasDepotCoords;
     }
     return true;
   }, { message: 'Provide required logistics data: HOME requires delivery_lat and delivery_lng; DEPOT requires depot_name and depot_lat/depot_lng' })
});

/**
 * Schema for getting a single order
 */
export const getOrderSchema = z.object({
  params: z.object({
    orderId: z.string().uuid("Invalid order ID format")
  })
});

/**
 * Schema for listing orders with filters
 */
export const listOrdersSchema = z.object({
  query: z.object({
    page: z.string().optional().transform(val => (val ? parseInt(val, 10) : 1)),
    limit: z
      .string()
      .optional()
      .transform(val => (val ? parseInt(val, 10) : 10)),
    status: z
      .enum([
        "CART",
        "PENDING",
        "PENDING_PAYMENT",
        "CONFIRMED",
        "PREPARING",
        "READY_FOR_PICKUP",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "CANCELLED",
        "REFUNDED"
      ])
      .optional(),
    shop_id: z.string().uuid("Invalid shop ID format").optional(),
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().optional()
  })
});

/**
 * Schema for updating order status (seller workflow)
 */
export const updateOrderStatusSchema = z.object({
  params: z.object({
    orderId: z.string().uuid("Invalid order ID format")
  }),
  body: z.object({
    status: z.enum(
      [
        "CONFIRMED",
        "PREPARING",
        "READY_FOR_PICKUP",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "CANCELLED"
      ],
      { message: "Invalid order status" }
    ),
    notes: z
      .string()
      .max(500, "Notes must not exceed 500 characters")
      .optional()
    ,
    waybill_number: z.string().max(200).optional(),
    waybill_photo_url: z.string().max(2000).optional()
  })
});

/**
 * Schema for cancelling an order
 */
export const cancelOrderSchema = z.object({
  params: z.object({
    orderId: z.string().uuid("Invalid order ID format")
  }),
  body: z.object({
    reason: z
      .string({ message: "Cancellation reason is required" })
      .min(10, "Reason must be at least 10 characters")
      .max(500, "Reason must not exceed 500 characters")
  })
});

/**
 * Schema for getting shop orders (seller view)
 */
export const getShopOrdersSchema = z.object({
  params: z.object({
    shopId: z.string().uuid("Invalid shop ID format")
  }),
  query: z.object({
    page: z.string().optional().transform(val => (val ? parseInt(val, 10) : 1)),
    limit: z
      .string()
      .optional()
      .transform(val => (val ? parseInt(val, 10) : 10)),
    status: z
      .enum([
        "PENDING",
        "CONFIRMED",
        "PREPARING",
        "READY_FOR_PICKUP",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "CANCELLED",
        "REFUNDED"
      ])
      .optional(),
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().optional()
  })
});

/**
 * Schema for getting order tracking
 */
export const getOrderTrackingSchema = z.object({
  params: z.object({
    orderId: z.string().uuid("Invalid order ID format")
  })
});

/**
 * Schema for updating delivery location (buyer or recipient via token)
 */
export const updateDeliveryLocationSchema = z.object({
  params: z.object({
    orderId: z.string().uuid("Invalid order ID format")
  }),
  body: z.object({
    delivery_lat: z.number().min(-90).max(90),
    delivery_lng: z.number().min(-180).max(180),
    delivery_directions: z.string().max(2000).optional(),
    token: z.string().optional()
  })
});

/**
 * Schema for getting all orders (admin)
 */
export const getAllOrdersSchema = z.object({
  query: z.object({
    page: z.string().optional().transform(val => (val ? parseInt(val, 10) : 1)),
    limit: z
      .string()
      .optional()
      .transform(val => (val ? parseInt(val, 10) : 10)),
    status: z
      .enum([
        "PENDING",
        "CONFIRMED",
        "PREPARING",
        "READY_FOR_PICKUP",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "CANCELLED",
        "REFUNDED"
      ])
      .optional(),
    shop_id: z.string().uuid("Invalid shop ID format").optional(),
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().optional(),
    search: z.string().optional()
  })
});

/**
 * Schema for getting order statistics
 */
export const getOrderStatsSchema = z.object({
  query: z.object({
    shop_id: z.string().uuid("Invalid shop ID format").optional(),
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().optional()
  })
});

// Type exports for TypeScript
export type CheckoutInput = z.infer<typeof checkoutSchema>["body"];
export type GetOrderInput = z.infer<typeof getOrderSchema>;
export type ListOrdersInput = z.infer<typeof listOrdersSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type GetShopOrdersInput = z.infer<typeof getShopOrdersSchema>;
export type GetOrderTrackingInput = z.infer<typeof getOrderTrackingSchema>;
export type GetAllOrdersInput = z.infer<typeof getAllOrdersSchema>;
export type GetOrderStatsInput = z.infer<typeof getOrderStatsSchema>;
