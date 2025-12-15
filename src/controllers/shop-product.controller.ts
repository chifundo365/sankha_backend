import { Request, Response } from "express";
import prisma from "../prismaClient";
import { errorResponse, successResponse } from "../utils/response";
import { Prisma } from "../../generated/prisma";
import { CloudinaryService } from "../services/cloudinary.service";

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

      // Add product to shop (initial stock trigger handles logging automatically)
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

      // Update shop product (trigger handles stock change logging with custom reason)
      let updatedShopProduct;
      if (updateData.stock_quantity !== undefined && updateData.stock_quantity !== existingShopProduct.stock_quantity) {
        // Use transaction with session variable for custom reason
        const reason = `Stock adjustment during product update by ${req.user!.role}`;
        updatedShopProduct = await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL app.stock_change_reason = '${reason.replace(/'/g, "''")}'`);
          return tx.shop_products.update({
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
        });
      } else {
        // No stock change, update normally
        updatedShopProduct = await prisma.shop_products.update({
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
      }

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

      // Calculate stock change
      const oldStock = existingShopProduct.stock_quantity;
      const stockDifference = stock_quantity - oldStock;

      // Update stock (trigger handles logging with custom reason)
      let updatedShopProduct;
      if (stockDifference !== 0) {
        const reason = `Manual stock adjustment by ${req.user!.role}`;
        updatedShopProduct = await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL app.stock_change_reason = '${reason.replace(/'/g, "''")}'`);
          return tx.shop_products.update({
            where: { id: shopProductId },
            data: {
              stock_quantity,
              updated_at: new Date()
            }
          });
        });
      } else {
        updatedShopProduct = existingShopProduct;
      }

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
  },

  /**
   * Upload shop product images
   * POST /api/shops/:shopId/products/:shopProductId/images
   * Protected - Shop owner only
   */
  uploadShopProductImages: async (req: Request, res: Response) => {
    try {
      const { shopId, shopProductId } = req.params;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      // Check ownership
      const hasAccess = await checkShopOwnership(shopId, userId, userRole);
      if (!hasAccess) {
        return errorResponse(res, "Unauthorized access to shop", null, 403);
      }

      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return errorResponse(res, "No image files provided", null, 400);
      }

      const shopProduct = await prisma.shop_products.findUnique({
        where: { id: shopProductId },
        select: { images: true, shop_id: true }
      });

      if (!shopProduct) {
        return errorResponse(res, "Shop product not found", null, 404);
      }

      // Verify product belongs to this shop
      if (shopProduct.shop_id !== shopId) {
        return errorResponse(res, "Product does not belong to this shop", null, 400);
      }

      // Upload new images
      const fileBuffers = req.files.map((file: Express.Multer.File) => file.buffer);
      const uploadResults = await CloudinaryService.uploadMultiple(
        fileBuffers,
        `shop_products/${shopProductId}`
      );

      const successfulUploads = uploadResults
        .filter(result => result.success && result.url)
        .map(result => result.url!);

      if (successfulUploads.length === 0) {
        return errorResponse(res, "Failed to upload any images", null, 500);
      }

      // Merge with existing images
      const existingImages = shopProduct.images || [];
      const newImages = [...existingImages, ...successfulUploads];

      // Limit to 10 images total
      const limitedImages = newImages.slice(0, 10);

      const updatedShopProduct = await prisma.shop_products.update({
        where: { id: shopProductId },
        data: { images: limitedImages },
        select: {
          id: true,
          images: true,
          products: {
            select: {
              name: true
            }
          }
        }
      });

      return successResponse(
        res,
        `${successfulUploads.length} image(s) uploaded successfully`,
        updatedShopProduct,
        200
      );
    } catch (error) {
      console.error("Upload shop product images error:", error);
      return errorResponse(res, "Failed to upload shop product images", null, 500);
    }
  },

  /**
   * Get stock change history for a shop product
   * GET /api/shops/:shopId/products/:shopProductId/stock-logs
   * Protected - Shop owner only
   */
  getStockLogs: async (req: Request, res: Response) => {
    try {
      const { shopId, shopProductId } = req.params;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const hasAccess = await checkShopOwnership(shopId, userId, userRole);
      if (!hasAccess) {
        return errorResponse(res, "Unauthorized access to shop", null, 403);
      }

      const shopProduct = await prisma.shop_products.findUnique({
        where: { id: shopProductId },
        select: { shop_id: true }
      });

      if (!shopProduct) {
        return errorResponse(res, "Shop product not found", null, 404);
      }

      if (shopProduct.shop_id !== shopId) {
        return errorResponse(res, "Product does not belong to this shop", null, 400);
      }

      const logs = await prisma.shop_products_log.findMany({
        where: { shop_product_id: shopProductId },
        orderBy: { created_at: 'desc' },
        take: 50
      });

      return successResponse(res, "Stock logs retrieved successfully", { logs }, 200);
    } catch (error) {
      console.error("Get stock logs error:", error);
      return errorResponse(res, "Failed to retrieve stock logs", null, 500);
    }
  },

  /**
   * Delete shop product image
   * DELETE /api/shops/:shopId/products/:shopProductId/images/:imageIndex
   * Protected - Shop owner only
   */
  deleteShopProductImage: async (req: Request, res: Response) => {
    try {
      const { shopId, shopProductId, imageIndex } = req.params;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const hasAccess = await checkShopOwnership(shopId, userId, userRole);
      if (!hasAccess) {
        return errorResponse(res, "Unauthorized access to shop", null, 403);
      }

      const shopProduct = await prisma.shop_products.findUnique({
        where: { id: shopProductId },
        select: { images: true, shop_id: true }
      });

      if (!shopProduct) {
        return errorResponse(res, "Shop product not found", null, 404);
      }

      if (shopProduct.shop_id !== shopId) {
        return errorResponse(res, "Product does not belong to this shop", null, 400);
      }

      const images = shopProduct.images || [];
      const index = parseInt(imageIndex);

      if (index < 0 || index >= images.length) {
        return errorResponse(res, "Invalid image index", null, 400);
      }

      const imageUrl = images[index];
      
      // Delete from Cloudinary
      const publicId = CloudinaryService.extractPublicId(imageUrl);
      if (publicId) {
        await CloudinaryService.deleteImage(publicId);
      }

      // Remove from array
      const updatedImages = images.filter((_, i) => i !== index);

      const updatedShopProduct = await prisma.shop_products.update({
        where: { id: shopProductId },
        data: { images: updatedImages },
        select: {
          id: true,
          images: true,
          products: {
            select: {
              name: true
            }
          }
        }
      });

      return successResponse(res, "Shop product image deleted successfully", updatedShopProduct, 200);
    } catch (error) {
      console.error("Delete shop product image error:", error);
      return errorResponse(res, "Failed to delete shop product image", null, 500);
    }
  }
};
