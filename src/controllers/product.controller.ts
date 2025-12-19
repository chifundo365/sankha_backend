import { Request, Response } from "express";
import prisma from "../prismaClient";
import { errorResponse, successResponse } from "../utils/response";
import { Prisma } from "../../generated/prisma";
import { CloudinaryService } from "../services/cloudinary.service";
import { productMatchingService } from "../services/productMatching.service";

export const productController = {
  /**
   * Get all products with pagination, search, and filtering
   * GET /api/products
   * Public access
   */
  getAllProducts: async (req: Request, res: Response) => {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        category_id,
        brand,
        is_active,
        min_price,
        max_price,
        sort_by = "created_at",
        sort_order = "desc"
      } = req.query;

      // Calculate pagination
      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      // Build where clause
      const where: Prisma.productsWhereInput = {};

      // Search by name or brand
      if (search) {
        where.OR = [
          { name: { contains: String(search), mode: "insensitive" } },
          { brand: { contains: String(search), mode: "insensitive" } },
          { description: { contains: String(search), mode: "insensitive" } }
        ];
      }

      // Filter by category
      if (category_id) {
        where.category_id = String(category_id);
      }

      // Filter by brand
      if (brand) {
        where.brand = { contains: String(brand), mode: "insensitive" };
      }

      // Filter by active status
      if (is_active !== undefined) {
        where.is_active = is_active === "true";
      }

      // Filter by price range
      if (min_price || max_price) {
        where.base_price = {};
        if (min_price) {
          where.base_price.gte = Number(min_price);
        }
        if (max_price) {
          where.base_price.lte = Number(max_price);
        }
      }

      // Build orderBy clause
      const orderBy: Prisma.productsOrderByWithRelationInput = {
        [String(sort_by)]: sort_order === "asc" ? "asc" : "desc"
      };

      // Execute queries in parallel
      const [products, totalCount] = await Promise.all([
        prisma.products.findMany({
          where,
          skip,
          take,
          orderBy,
          include: {
            categories: {
              select: {
                id: true,
                name: true,
                description: true
              }
            },
            _count: {
              select: {
                shop_products: true
              }
            }
          }
        }),
        prisma.products.count({ where })
      ]);

      // Calculate pagination metadata
      const totalPages = Math.ceil(totalCount / take);
      const hasNextPage = Number(page) < totalPages;
      const hasPrevPage = Number(page) > 1;

      return successResponse(
        res,
        "Products retrieved successfully",
        {
          products,
          pagination: {
            currentPage: Number(page),
            totalPages,
            totalCount,
            limit: take,
            hasNextPage,
            hasPrevPage
          }
        },
        200
      );
    } catch (error) {
      console.error("Get all products error:", error);
      return errorResponse(res, "Failed to retrieve products", null, 500);
    }
  },

  /**
   * Get a single product by ID
   * GET /api/products/:id
   * Public access
   */
  getProductById: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const product = await prisma.products.findUnique({
        where: { id },
        include: {
          categories: {
            select: {
              id: true,
              name: true,
              description: true
            }
          },
          shop_products: {
            select: {
              id: true,
              sku: true,
              price: true,
              stock_quantity: true,
              condition: true,
              is_available: true,
              shops: {
                select: {
                  id: true,
                  name: true,
                  city: true,
                  phone: true
                }
              }
            },
            where: {
              is_available: true,
              stock_quantity: {
                gt: 0
              }
            }
          },
          _count: {
            select: {
              shop_products: true
            }
          }
        }
      });

      if (!product) {
        return errorResponse(res, "Product not found", null, 404);
      }

      return successResponse(
        res,
        "Product retrieved successfully",
        product,
        200
      );
    } catch (error) {
      console.error("Get product by ID error:", error);
      return errorResponse(res, "Failed to retrieve product", null, 500);
    }
  },

  /**
   * Create a new product
   * POST /api/products
   * Admin only
   */
  createProduct: async (req: Request, res: Response) => {
    try {
      const {
        name,
        brand,
        description,
        category_id,
        base_price,
        images,
        is_active
      } = req.body;

      // Validate category exists if provided
      if (category_id) {
        const categoryExists = await prisma.categories.findUnique({
          where: { id: category_id }
        });

        if (!categoryExists) {
          return errorResponse(res, "Category not found", null, 404);
        }
      }

      // Create product
      const product = await prisma.products.create({
        data: {
          name,
          brand,
          description,
          category_id,
          base_price,
          images: images || [],
          is_active: is_active ?? true
        },
        include: {
          categories: {
            select: {
              id: true,
              name: true,
              description: true
            }
          }
        }
      });

      return successResponse(
        res,
        "Product created successfully",
        product,
        201
      );
    } catch (error) {
      console.error("Create product error:", error);
      
      // Handle unique constraint violations
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          return errorResponse(res, "Product with this name already exists", null, 409);
        }
      }
      
      return errorResponse(res, "Failed to create product", null, 500);
    }
  },

  /**
   * Update an existing product
   * PUT /api/products/:id
   * Admin only
   */
  updateProduct: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Check if product exists
      const existingProduct = await prisma.products.findUnique({
        where: { id }
      });

      if (!existingProduct) {
        return errorResponse(res, "Product not found", null, 404);
      }

      // Validate category exists if being updated
      if (updateData.category_id) {
        const categoryExists = await prisma.categories.findUnique({
          where: { id: updateData.category_id }
        });

        if (!categoryExists) {
          return errorResponse(res, "Category not found", null, 404);
        }
      }

      // Update product
      const updatedProduct = await prisma.products.update({
        where: { id },
        data: {
          ...updateData,
          updated_at: new Date()
        },
        include: {
          categories: {
            select: {
              id: true,
              name: true,
              description: true
            }
          }
        }
      });

      return successResponse(
        res,
        "Product updated successfully",
        updatedProduct,
        200
      );
    } catch (error) {
      console.error("Update product error:", error);
      
      // Handle unique constraint violations
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          return errorResponse(res, "Product with this name already exists", null, 409);
        }
      }
      
      return errorResponse(res, "Failed to update product", null, 500);
    }
  },

  /**
   * Delete a product (soft delete by setting is_active to false)
   * DELETE /api/products/:id
   * Admin only
   */
  deleteProduct: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Check if product exists
      const existingProduct = await prisma.products.findUnique({
        where: { id }
      });

      if (!existingProduct) {
        return errorResponse(res, "Product not found", null, 404);
      }

      // Soft delete by setting is_active to false
      await prisma.products.update({
        where: { id },
        data: {
          is_active: false,
          updated_at: new Date()
        }
      });

      return successResponse(
        res,
        "Product deleted successfully",
        null,
        200
      );
    } catch (error) {
      console.error("Delete product error:", error);
      return errorResponse(res, "Failed to delete product", null, 500);
    }
  },

  /**
   * Get products by category
   * GET /api/products/category/:categoryId
   * Public access
   */
  getProductsByCategory: async (req: Request, res: Response) => {
    try {
      const { categoryId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      // Check if category exists
      const categoryExists = await prisma.categories.findUnique({
        where: { id: categoryId }
      });

      if (!categoryExists) {
        return errorResponse(res, "Category not found", null, 404);
      }

      const [products, totalCount] = await Promise.all([
        prisma.products.findMany({
          where: {
            category_id: categoryId,
            is_active: true
          },
          skip,
          take,
          include: {
            categories: true,
            _count: {
              select: {
                shop_products: true
              }
            }
          },
          orderBy: {
            created_at: "desc"
          }
        }),
        prisma.products.count({
          where: {
            category_id: categoryId,
            is_active: true
          }
        })
      ]);

      const totalPages = Math.ceil(totalCount / take);

      return successResponse(
        res,
        "Products retrieved successfully",
        {
          products,
          category: categoryExists,
          pagination: {
            currentPage: Number(page),
            totalPages,
            totalCount,
            limit: take
          }
        },
        200
      );
    } catch (error) {
      console.error("Get products by category error:", error);
      return errorResponse(res, "Failed to retrieve products", null, 500);
    }
  },

  /**
   * Upload product images
   * POST /api/products/:productId/images
   * Protected - ADMIN only
   */
  uploadProductImages: async (req: Request, res: Response) => {
    try {
      const { productId } = req.params;

      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return errorResponse(res, "No image files provided", null, 400);
      }

      const product = await prisma.products.findUnique({
        where: { id: productId },
        select: { images: true, name: true }
      });

      if (!product) {
        return errorResponse(res, "Product not found", null, 404);
      }

      // Upload new images
      const fileBuffers = req.files.map((file: Express.Multer.File) => file.buffer);
      const uploadResults = await CloudinaryService.uploadMultiple(
        fileBuffers,
        `products/${productId}`
      );

      const successfulUploads = uploadResults
        .filter(result => result.success && result.url)
        .map(result => result.url!);

      if (successfulUploads.length === 0) {
        return errorResponse(res, "Failed to upload any images", null, 500);
      }

      // Merge with existing images
      const existingImages = product.images || [];
      const newImages = [...existingImages, ...successfulUploads];

      // Limit to 10 images total
      const limitedImages = newImages.slice(0, 10);

      const updatedProduct = await prisma.products.update({
        where: { id: productId },
        data: { images: limitedImages },
        select: {
          id: true,
          name: true,
          images: true
        }
      });

      return successResponse(
        res,
        `${successfulUploads.length} image(s) uploaded successfully`,
        updatedProduct,
        200
      );
    } catch (error) {
      console.error("Upload product images error:", error);
      return errorResponse(res, "Failed to upload product images", null, 500);
    }
  },

  /**
   * Delete product image
   * DELETE /api/products/:productId/images/:imageIndex
   * Protected - ADMIN only
   */
  deleteProductImage: async (req: Request, res: Response) => {
    try {
      const { productId, imageIndex } = req.params;

      const product = await prisma.products.findUnique({
        where: { id: productId },
        select: { images: true, name: true }
      });

      if (!product) {
        return errorResponse(res, "Product not found", null, 404);
      }

      const images = product.images || [];
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

      const updatedProduct = await prisma.products.update({
        where: { id: productId },
        data: { images: updatedImages },
        select: {
          id: true,
          name: true,
          images: true
        }
      });

      return successResponse(res, "Product image deleted successfully", updatedProduct, 200);
    } catch (error) {
      console.error("Delete product image error:", error);
      return errorResponse(res, "Failed to delete product image", null, 500);
    }
  },

  // =============================================
  // PRODUCT MATCHING ENDPOINTS
  // =============================================

  /**
   * Search for matching products (for sellers creating listings)
   * GET /api/products/match
   * Authenticated users (sellers)
   */
  findMatchingProducts: async (req: Request, res: Response) => {
    try {
      const { query, brand, gtin, category_id, limit } = req.query;

      if (!query || typeof query !== "string") {
        return errorResponse(res, "Search query is required", null, 400);
      }

      const result = await productMatchingService.findMatchingProducts(query, {
        brand: brand as string | undefined,
        gtin: gtin as string | undefined,
        categoryId: category_id as string | undefined,
        limit: limit ? Number(limit) : 5
      });

      return successResponse(res, "Product matches found", {
        ...result,
        message: result.hasExactMatch 
          ? "Exact match found! Use this product for your listing."
          : result.suggestions.length > 0
            ? "Similar products found. Select one or create a new product."
            : "No matches found. You can create a new product."
      }, 200);
    } catch (error) {
      console.error("Find matching products error:", error);
      return errorResponse(res, "Failed to search for products", null, 500);
    }
  },

  /**
   * Create a new product (pending approval)
   * POST /api/products/request
   * Authenticated users (sellers)
   */
  requestNewProduct: async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return errorResponse(res, "User not authenticated", null, 401);
      }

      const {
        name,
        brand,
        model,
        description,
        category_id,
        base_price,
        images,
        gtin,
        mpn,
        keywords,
        aliases
      } = req.body;

      if (!name) {
        return errorResponse(res, "Product name is required", null, 400);
      }

      // Check for existing matches first
      const matches = await productMatchingService.findMatchingProducts(name, {
        brand,
        gtin
      });

      if (matches.hasExactMatch) {
        return errorResponse(
          res, 
          "A matching product already exists. Please use the existing product for your listing.",
          { existingProduct: matches.bestMatch },
          409
        );
      }

      // Validate category exists if provided
      if (category_id) {
        const categoryExists = await prisma.categories.findUnique({
          where: { id: category_id }
        });

        if (!categoryExists) {
          return errorResponse(res, "Category not found", null, 404);
        }
      }

      // Create pending product
      const product = await productMatchingService.createPendingProduct(
        {
          name,
          brand,
          model,
          description,
          category_id,
          base_price,
          images,
          gtin,
          mpn,
          keywords,
          aliases
        },
        userId
      );

      return successResponse(
        res,
        "Product submitted for review. You'll be notified once it's approved.",
        {
          product,
          status: "PENDING",
          similarProducts: matches.suggestions.slice(0, 3) // Show similar products for reference
        },
        201
      );
    } catch (error) {
      console.error("Request new product error:", error);
      return errorResponse(res, "Failed to submit product request", null, 500);
    }
  },

  /**
   * Get pending products for admin review
   * GET /api/products/pending
   * Admin only
   */
  getPendingProducts: async (req: Request, res: Response) => {
    try {
      const { page, limit, category_id } = req.query;

      const result = await productMatchingService.getPendingProducts({
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
        categoryId: category_id as string | undefined
      });

      return successResponse(res, "Pending products retrieved", result, 200);
    } catch (error) {
      console.error("Get pending products error:", error);
      return errorResponse(res, "Failed to retrieve pending products", null, 500);
    }
  },

  /**
   * Approve a pending product
   * POST /api/products/:id/approve
   * Admin only
   * 
   * Body (optional):
   * - auto_add_to_shop: boolean (default: true) - Auto-add to seller's shop
   * - price: number - Override price for shop listing
   * - stock_quantity: number - Initial stock (default: 0)
   * - condition: string - NEW, USED, REFURBISHED (default: NEW)
   * - sku: string - Custom SKU (auto-generated if not provided)
   * - shop_description: string - Custom description for shop listing
   */
  approveProduct: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const adminId = req.user?.id;
      const {
        auto_add_to_shop = true,
        price,
        stock_quantity,
        condition,
        sku,
        shop_description
      } = req.body;

      if (!adminId) {
        return errorResponse(res, "Admin not authenticated", null, 401);
      }

      // Check product exists and is pending
      const product = await prisma.products.findUnique({
        where: { id },
        include: {
          created_by_user: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true
            }
          }
        }
      });

      if (!product) {
        return errorResponse(res, "Product not found", null, 404);
      }

      if (product.status !== "PENDING") {
        return errorResponse(res, `Product is already ${product.status}`, null, 400);
      }

      const result = await productMatchingService.approveProduct(id, adminId, {
        autoAddToShop: auto_add_to_shop,
        shopListingDetails: {
          price,
          stock_quantity,
          condition,
          sku,
          shop_description
        }
      });

      const message = result.autoAdded
        ? `Product approved and automatically added to ${result.shopProduct?.shops?.name || "seller's shop"}`
        : "Product approved successfully";

      return successResponse(res, message, {
        product: result.product,
        shopListing: result.shopProduct,
        autoAddedToShop: result.autoAdded,
        requestedBy: product.created_by_user
      }, 200);
    } catch (error) {
      console.error("Approve product error:", error);
      return errorResponse(res, "Failed to approve product", null, 500);
    }
  },

  /**
   * Reject a pending product
   * POST /api/products/:id/reject
   * Admin only
   */
  rejectProduct: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return errorResponse(res, "Rejection reason is required", null, 400);
      }

      // Check product exists and is pending
      const product = await prisma.products.findUnique({
        where: { id }
      });

      if (!product) {
        return errorResponse(res, "Product not found", null, 404);
      }

      if (product.status !== "PENDING") {
        return errorResponse(res, `Product is already ${product.status}`, null, 400);
      }

      const rejected = await productMatchingService.rejectProduct(id, reason);

      return successResponse(res, "Product rejected", rejected, 200);
    } catch (error) {
      console.error("Reject product error:", error);
      return errorResponse(res, "Failed to reject product", null, 500);
    }
  },

  /**
   * Merge duplicate product into canonical product
   * POST /api/products/:id/merge
   * Admin only
   */
  mergeProducts: async (req: Request, res: Response) => {
    try {
      const { id } = req.params; // duplicate product ID
      const { canonical_id } = req.body; // product to merge into

      if (!canonical_id) {
        return errorResponse(res, "Canonical product ID is required", null, 400);
      }

      if (id === canonical_id) {
        return errorResponse(res, "Cannot merge product into itself", null, 400);
      }

      // Verify both products exist
      const [duplicate, canonical] = await Promise.all([
        prisma.products.findUnique({ where: { id } }),
        prisma.products.findUnique({ where: { id: canonical_id } })
      ]);

      if (!duplicate) {
        return errorResponse(res, "Duplicate product not found", null, 404);
      }

      if (!canonical) {
        return errorResponse(res, "Canonical product not found", null, 404);
      }

      const merged = await productMatchingService.mergeProducts(id, canonical_id);

      return successResponse(res, "Products merged successfully", {
        merged,
        mergedInto: canonical
      }, 200);
    } catch (error) {
      console.error("Merge products error:", error);
      return errorResponse(res, "Failed to merge products", null, 500);
    }
  },

  /**
   * Find potential duplicates for a product
   * GET /api/products/:id/duplicates
   * Admin only
   */
  findDuplicates: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const product = await prisma.products.findUnique({
        where: { id }
      });

      if (!product) {
        return errorResponse(res, "Product not found", null, 404);
      }

      const duplicates = await productMatchingService.findPotentialDuplicates(id);

      return successResponse(res, "Potential duplicates found", {
        product: {
          id: product.id,
          name: product.name,
          brand: product.brand
        },
        potentialDuplicates: duplicates
      }, 200);
    } catch (error) {
      console.error("Find duplicates error:", error);
      return errorResponse(res, "Failed to find duplicates", null, 500);
    }
  }
};
