import { Request, Response } from "express";
import prisma from "../prismaClient";
import { errorResponse, successResponse } from "../utils/response";
import { Prisma } from "../../generated/prisma";

/**
 * Helper function to check if user owns the shop
 */
const checkShopOwnership = async (shopId: string, userId: string, userRole: string) => {
  // Admins and super admins can access any shop
  if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
    return true;
  }

  // For sellers, check if they own the shop
  const shop = await prisma.shops.findUnique({
    where: { id: shopId },
    select: { owner_id: true }
  });

  if (!shop) {
    return false;
  }

  return shop.owner_id === userId;
};

export const shopController = {
  /**
   * Get all shops with filters
   * GET /api/shops
   * Public access
   */
  getAllShops: async (req: Request, res: Response) => {
    try {
      const {
        page = 1,
        limit = 10,
        city,
        is_verified,
        delivery_enabled,
        search,
        owner_id
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      // Build where clause
      const where: Prisma.shopsWhereInput = {};

      if (city) {
        where.city = { equals: String(city), mode: "insensitive" };
      }

      if (is_verified !== undefined) {
        where.is_verified = is_verified === "true";
      }

      if (delivery_enabled !== undefined) {
        where.delivery_enabled = delivery_enabled === "true";
      }

      if (owner_id) {
        where.owner_id = String(owner_id);
      }

      // Search in shop name or description
      if (search) {
        where.OR = [
          { name: { contains: String(search), mode: "insensitive" } },
          { description: { contains: String(search), mode: "insensitive" } }
        ];
      }

      // Fetch shops
      const [shops, totalCount] = await Promise.all([
        prisma.shops.findMany({
          where,
          skip,
          take,
          select: {
            id: true,
            owner_id: true,
            name: true,
            description: true,
            business_registration_no: true,
            address_line1: true,
            city: true,
            latitude: true,
            longitude: true,
            phone: true,
            email: true,
            is_verified: true,
            delivery_enabled: true,
            logo: true,
            banner: true,
            gallery: true,
            delivery_methods: true,
            created_at: true,
            updated_at: true,
            users: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
                phone_number: true
              }
            },
            _count: {
              select: {
                shop_products: true,
                orders: true
              }
            }
          },
          orderBy: {
            created_at: "desc"
          }
        }),
        prisma.shops.count({ where })
      ]);

      const totalPages = Math.ceil(totalCount / take);

      return successResponse(
        res,
        "Shops retrieved successfully",
        {
          shops,
          pagination: {
            currentPage: Number(page),
            totalPages,
            totalCount,
            limit: take,
            hasNextPage: Number(page) < totalPages,
            hasPrevPage: Number(page) > 1
          }
        },
        200
      );
    } catch (error) {
      console.error("Get all shops error:", error);
      return errorResponse(res, "Failed to retrieve shops", null, 500);
    }
  },

  /**
   * Get single shop by ID
   * GET /api/shops/:shopId
   * Public access
   */
  getShopById: async (req: Request, res: Response) => {
    try {
      const { shopId } = req.params;

      const shop = await prisma.shops.findUnique({
        where: { id: shopId },
        include: {
          users: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
              phone_number: true,
              profile_image: true
            }
          },
          _count: {
            select: {
              shop_products: true,
              orders: true
            }
          }
        }
      });

      if (!shop) {
        return errorResponse(res, "Shop not found", null, 404);
      }

      return successResponse(res, "Shop retrieved successfully", shop, 200);
    } catch (error) {
      console.error("Get shop by ID error:", error);
      return errorResponse(res, "Failed to retrieve shop", null, 500);
    }
  },

  /**
   * Create a new shop
   * POST /api/shops
   * Seller, Admin, Super Admin
   */
  createShop: async (req: Request, res: Response) => {
    try {
      const {
        name,
        description,
        business_registration_no,
        address_line1,
        city,
        latitude,
        longitude,
        phone,
        email,
        delivery_enabled,
        logo,
        banner,
        gallery,
        delivery_methods
      } = req.body;

      // Check if user already has reached the shop limit (sellers can own up to 5 shops)
      if (req.user!.role === "SELLER") {
        const shopCount = await prisma.shops.count({
          where: { owner_id: req.user!.id }
        });

        if (shopCount >= 5) {
          return errorResponse(
            res,
            "You have reached the maximum limit of 5 shops. Each seller can own up to 5 shops.",
            null,
            409
          );
        }
      }

      // Create shop
      const shop = await prisma.shops.create({
        data: {
          owner_id: req.user!.id,
          name,
          description,
          business_registration_no,
          address_line1,
          city,
          latitude,
          longitude,
          phone,
          email,
          delivery_enabled: delivery_enabled ?? true,
          is_verified: req.user!.role === "ADMIN" || req.user!.role === "SUPER_ADMIN" ? true : false,
          logo,
          banner,
          gallery,
          delivery_methods
        },
        include: {
          users: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true
            }
          }
        }
      });

      return successResponse(res, "Shop created successfully", shop, 201);
    } catch (error) {
      console.error("Create shop error:", error);
      return errorResponse(res, "Failed to create shop", null, 500);
    }
  },

  /**
   * Update a shop
   * PUT /api/shops/:shopId
   * Seller (shop owner), Admin, Super Admin
   */
  updateShop: async (req: Request, res: Response) => {
    try {
      const { shopId } = req.params;
      const updateData = req.body;

      // Check shop ownership
      const hasAccess = await checkShopOwnership(
        shopId,
        req.user!.id,
        req.user!.role
      );

      if (!hasAccess) {
        return errorResponse(
          res,
          "You don't have permission to update this shop",
          null,
          403
        );
      }

      // Check if shop exists
      const existingShop = await prisma.shops.findUnique({
        where: { id: shopId }
      });

      if (!existingShop) {
        return errorResponse(res, "Shop not found", null, 404);
      }

      // Update shop
      const updatedShop = await prisma.shops.update({
        where: { id: shopId },
        data: updateData,
        include: {
          users: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true
            }
          }
        }
      });

      return successResponse(res, "Shop updated successfully", updatedShop, 200);
    } catch (error) {
      console.error("Update shop error:", error);
      return errorResponse(res, "Failed to update shop", null, 500);
    }
  },

  /**
   * Delete a shop
   * DELETE /api/shops/:shopId
   * Seller (shop owner), Admin, Super Admin
   */
  deleteShop: async (req: Request, res: Response) => {
    try {
      const { shopId } = req.params;

      // Check shop ownership
      const hasAccess = await checkShopOwnership(
        shopId,
        req.user!.id,
        req.user!.role
      );

      if (!hasAccess) {
        return errorResponse(
          res,
          "You don't have permission to delete this shop",
          null,
          403
        );
      }

      // Check if shop exists
      const existingShop = await prisma.shops.findUnique({
        where: { id: shopId },
        include: {
          _count: {
            select: {
              shop_products: true,
              orders: true
            }
          }
        }
      });

      if (!existingShop) {
        return errorResponse(res, "Shop not found", null, 404);
      }

      // Prevent deletion if shop has active products or orders
      if (existingShop._count.shop_products > 0) {
        return errorResponse(
          res,
          "Cannot delete shop with existing products. Please remove all products first.",
          null,
          400
        );
      }

      if (existingShop._count.orders > 0) {
        return errorResponse(
          res,
          "Cannot delete shop with existing orders.",
          null,
          400
        );
      }

      // Delete shop
      await prisma.shops.delete({
        where: { id: shopId }
      });

      return successResponse(res, "Shop deleted successfully", null, 200);
    } catch (error) {
      console.error("Delete shop error:", error);
      return errorResponse(res, "Failed to delete shop", null, 500);
    }
  },

  /**
   * Verify a shop (ADMIN only)
   * PATCH /api/shops/:shopId/verify
   * Admin, Super Admin
   */
  verifyShop: async (req: Request, res: Response) => {
    try {
      const { shopId } = req.params;
      const { is_verified } = req.body;

      // Check if shop exists
      const existingShop = await prisma.shops.findUnique({
        where: { id: shopId }
      });

      if (!existingShop) {
        return errorResponse(res, "Shop not found", null, 404);
      }

      // Update verification status
      const updatedShop = await prisma.shops.update({
        where: { id: shopId },
        data: { is_verified },
        include: {
          users: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true
            }
          }
        }
      });

      return successResponse(
        res,
        `Shop ${is_verified ? "verified" : "unverified"} successfully`,
        updatedShop,
        200
      );
    } catch (error) {
      console.error("Verify shop error:", error);
      return errorResponse(res, "Failed to verify shop", null, 500);
    }
  },

  /**
   * Get current user's shops
   * GET /api/shops/my-shops
   * Seller, Admin, Super Admin
   */
  getMyShops: async (req: Request, res: Response) => {
    try {
      const shops = await prisma.shops.findMany({
        where: { owner_id: req.user!.id },
        include: {
          _count: {
            select: {
              shop_products: true,
              orders: true
            }
          }
        },
        orderBy: {
          created_at: "desc"
        }
      });

      return successResponse(res, "Your shops retrieved successfully", shops, 200);
    } catch (error) {
      console.error("Get my shops error:", error);
      return errorResponse(res, "Failed to retrieve your shops", null, 500);
    }
  }
};
