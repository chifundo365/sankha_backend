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

/**
 * Helper function to calculate review statistics for a shop product
 */
const getReviewStats = async (shopProductId: string) => {
  const reviews = await prisma.reviews.findMany({
    where: { shop_product_id: shopProductId },
    select: { rating: true }
  });

  if (reviews.length === 0) {
    return {
      average_rating: 0,
      review_count: 0,
      rating_breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    };
  }

  const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  
  const ratingBreakdown = reviews.reduce((acc, r) => {
    acc[r.rating as keyof typeof acc] = (acc[r.rating as keyof typeof acc] || 0) + 1;
    return acc;
  }, { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });

  return {
    average_rating: Number(averageRating.toFixed(2)),
    review_count: reviews.length,
    rating_breakdown: ratingBreakdown
  };
};

export const shopProductController = {
  /**
   * Get all products for a specific shop
   * GET /api/shops/:shopId/products
   * Public access
   */
  getShopProducts: async (req: Request, res: Response) => {
    try {
      const { shopId } = req.params;
      const {
        page = 1,
        limit = 10,
        is_available,
        condition,
        min_stock,
        search
      } = req.query;

      // Check if shop exists
      const shop = await prisma.shops.findUnique({
        where: { id: shopId },
        select: { id: true, name: true, city: true }
      });

      if (!shop) {
        return errorResponse(res, "Shop not found", null, 404);
      }

      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      // Build where clause
      const where: Prisma.shop_productsWhereInput = {
        shop_id: shopId
      };

      if (is_available !== undefined) {
        where.is_available = is_available === "true";
      }

      if (condition) {
        where.condition = String(condition) as any;
      }

      if (min_stock) {
        where.stock_quantity = { gte: Number(min_stock) };
      }

      // Search in product name or SKU
      if (search) {
        where.OR = [
          { sku: { contains: String(search), mode: "insensitive" } },
          { products: { name: { contains: String(search), mode: "insensitive" } } }
        ];
      }

      // Fetch shop products
      const [shopProducts, totalCount] = await Promise.all([
        prisma.shop_products.findMany({
          where,
          skip,
          take,
          include: {
            products: {
              select: {
                id: true,
                name: true,
                brand: true,
                description: true,
                base_price: true,
                categories: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          },
          orderBy: {
            created_at: "desc"
          }
        }),
        prisma.shop_products.count({ where })
      ]);

      // Add review statistics to each product
      const productsWithReviews = await Promise.all(
        shopProducts.map(async (product) => {
          const reviewStats = await getReviewStats(product.id);
          return {
            ...product,
            reviews: reviewStats
          };
        })
      );

      const totalPages = Math.ceil(totalCount / take);

      return successResponse(
        res,
        "Shop products retrieved successfully",
        {
          shop,
          products: productsWithReviews,
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
      console.error("Get shop products error:", error);
      return errorResponse(res, "Failed to retrieve shop products", null, 500);
    }
  },

  /**
   * Get a single shop product
   * GET /api/shops/:shopId/products/:shopProductId
   * Public access
   */
  getShopProduct: async (req: Request, res: Response) => {
    try {
      const { shopId, shopProductId } = req.params;

      const shopProduct = await prisma.shop_products.findFirst({
        where: {
          id: shopProductId,
          shop_id: shopId
        },
        include: {
          products: {
            include: {
              categories: true
            }
          },
          shops: {
            select: {
              id: true,
              name: true,
              description: true,
              city: true,
              phone: true,
              address_line1: true
            }
          }
        }
      });

      if (!shopProduct) {
        return errorResponse(res, "Shop product not found", null, 404);
      }

      // Add review statistics
      const reviewStats = await getReviewStats(shopProduct.id);

      return successResponse(
        res,
        "Shop product retrieved successfully",
        {
          ...shopProduct,
          reviews: reviewStats
        },
        200
      );
    } catch (error) {
      console.error("Get shop product error:", error);
      return errorResponse(res, "Failed to retrieve shop product", null, 500);
    }
  },

  /**
   * Add a product to shop inventory
   * POST /api/shops/:shopId/products
   * Seller (shop owner), Admin, Super Admin
   */
  addProductToShop: async (req: Request, res: Response) => {
    try {
      const { shopId } = req.params;
      const {
        product_id,
        sku,
        price,
        stock_quantity,
        condition,
        shop_description,
        specs,
        images,
        is_available
      } = req.body;

      // Check shop ownership
      const hasAccess = await checkShopOwnership(
        shopId,
        req.user!.id,
        req.user!.role
      );

      if (!hasAccess) {
        return errorResponse(
          res,
          "You don't have permission to add products to this shop",
          null,
          403
        );
      }

      // Check if shop exists
      const shop = await prisma.shops.findUnique({
        where: { id: shopId }
      });

      if (!shop) {
        return errorResponse(res, "Shop not found", null, 404);
      }

      // Check if product exists in catalog
      const product = await prisma.products.findUnique({
        where: { id: product_id }
      });

      if (!product) {
        return errorResponse(
          res,
          "Product not found in catalog. Contact admin to add it first.",
          null,
          404
        );
      }

      // Check if product already exists in this shop
      const existingShopProduct = await prisma.shop_products.findFirst({
        where: {
          shop_id: shopId,
          product_id: product_id
        }
      });

      if (existingShopProduct) {
        return errorResponse(
          res,
          "This product is already in your shop inventory",
          null,
          409
        );
      }

      // Add product to shop
      const shopProduct = await prisma.shop_products.create({
        data: {
          shop_id: shopId,
          product_id,
          sku,
          price,
          stock_quantity,
          condition: condition || "NEW",
          shop_description,
          specs,
          images: images || [],
          is_available: is_available ?? true
        },
        include: {
          products: {
            include: {
              categories: true
            }
          }
        }
      });

      return successResponse(
        res,
        "Product added to shop successfully",
        shopProduct,
        201
      );
    } catch (error) {
      console.error("Add product to shop error:", error);
      return errorResponse(res, "Failed to add product to shop", null, 500);
    }
  },

  /**
   * Update a shop product
   * PUT /api/shops/:shopId/products/:shopProductId
   * Seller (shop owner), Admin, Super Admin
   */
  updateShopProduct: async (req: Request, res: Response) => {
    try {
      const { shopId, shopProductId } = req.params;
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
          "You don't have permission to update products in this shop",
          null,
          403
        );
      }

      // Check if shop product exists
      const existingShopProduct = await prisma.shop_products.findFirst({
        where: {
          id: shopProductId,
          shop_id: shopId
        }
      });

      if (!existingShopProduct) {
        return errorResponse(res, "Shop product not found", null, 404);
      }

      // Update shop product
      const updatedShopProduct = await prisma.shop_products.update({
        where: { id: shopProductId },
        data: {
          ...updateData,
          updated_at: new Date()
        },
        include: {
          products: {
            include: {
              categories: true
            }
          }
        }
      });

      return successResponse(
        res,
        "Shop product updated successfully",
        updatedShopProduct,
        200
      );
    } catch (error) {
      console.error("Update shop product error:", error);
      return errorResponse(res, "Failed to update shop product", null, 500);
    }
  },

  /**
   * Remove a product from shop inventory (soft delete)
   * DELETE /api/shops/:shopId/products/:shopProductId
   * Seller (shop owner), Admin, Super Admin
   */
  removeProductFromShop: async (req: Request, res: Response) => {
    try {
      const { shopId, shopProductId } = req.params;

      // Check shop ownership
      const hasAccess = await checkShopOwnership(
        shopId,
        req.user!.id,
        req.user!.role
      );

      if (!hasAccess) {
        return errorResponse(
          res,
          "You don't have permission to remove products from this shop",
          null,
          403
        );
      }

      // Check if shop product exists
      const existingShopProduct = await prisma.shop_products.findFirst({
        where: {
          id: shopProductId,
          shop_id: shopId
        }
      });

      if (!existingShopProduct) {
        return errorResponse(res, "Shop product not found", null, 404);
      }

      // Soft delete by setting is_available to false
      await prisma.shop_products.update({
        where: { id: shopProductId },
        data: {
          is_available: false,
          updated_at: new Date()
        }
      });

      return successResponse(
        res,
        "Product removed from shop successfully",
        null,
        200
      );
    } catch (error) {
      console.error("Remove product from shop error:", error);
      return errorResponse(res, "Failed to remove product from shop", null, 500);
    }
  },

  /**
   * Update stock quantity (quick update for inventory management)
   * PATCH /api/shops/:shopId/products/:shopProductId/stock
   * Seller (shop owner), Admin, Super Admin
   */
  updateStock: async (req: Request, res: Response) => {
    try {
      const { shopId, shopProductId } = req.params;
      const { stock_quantity } = req.body;

      if (typeof stock_quantity !== "number" || stock_quantity < 0) {
        return errorResponse(
          res,
          "Stock quantity must be a non-negative number",
          null,
          400
        );
      }

      // Check shop ownership
      const hasAccess = await checkShopOwnership(
        shopId,
        req.user!.id,
        req.user!.role
      );

      if (!hasAccess) {
        return errorResponse(
          res,
          "You don't have permission to update stock in this shop",
          null,
          403
        );
      }

      // Check if shop product exists
      const existingShopProduct = await prisma.shop_products.findFirst({
        where: {
          id: shopProductId,
          shop_id: shopId
        }
      });

      if (!existingShopProduct) {
        return errorResponse(res, "Shop product not found", null, 404);
      }

      // Update stock
      const updatedShopProduct = await prisma.shop_products.update({
        where: { id: shopProductId },
        data: {
          stock_quantity,
          updated_at: new Date()
        }
      });

      return successResponse(
        res,
        "Stock updated successfully",
        {
          id: updatedShopProduct.id,
          stock_quantity: updatedShopProduct.stock_quantity
        },
        200
      );
    } catch (error) {
      console.error("Update stock error:", error);
      return errorResponse(res, "Failed to update stock", null, 500);
    }
  }
};
