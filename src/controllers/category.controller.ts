import { Request, Response } from "express";
import prisma from "../prismaClient";
import { errorResponse, successResponse } from "../utils/response";
import { Prisma } from "../../generated/prisma";

export const categoryController = {
  /**
   * Get all categories with optional filters
   * GET /api/categories
   * Public access
   */
  getAllCategories: async (req: Request, res: Response) => {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        include_counts = false,
        sort = "name_asc"
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      // Build where clause
      const where: Prisma.categoriesWhereInput = {};

      if (search) {
        where.OR = [
          { name: { contains: String(search), mode: "insensitive" } },
          { description: { contains: String(search), mode: "insensitive" } }
        ];
      }

      // Determine sort order
      let orderBy: Prisma.categoriesOrderByWithRelationInput = {};
      switch (sort) {
        case "name_asc":
          orderBy = { name: "asc" };
          break;
        case "name_desc":
          orderBy = { name: "desc" };
          break;
        case "created_asc":
          orderBy = { created_at: "asc" };
          break;
        case "created_desc":
          orderBy = { created_at: "desc" };
          break;
        case "products_asc":
          orderBy = { products: { _count: "asc" } };
          break;
        case "products_desc":
          orderBy = { products: { _count: "desc" } };
          break;
        default:
          orderBy = { name: "asc" };
      }

      // Fetch categories
      const [categories, totalCount] = await Promise.all([
        prisma.categories.findMany({
          where,
          skip,
          take,
          orderBy,
          select: {
            id: true,
            name: true,
            description: true,
            is_active: true,
            created_at: true,
            updated_at: true,
            ...(include_counts && {
              _count: {
                select: {
                  products: true
                }
              }
            })
          }
        }),
        prisma.categories.count({ where })
      ]);

      // Format response with product counts if requested
      const formattedCategories = categories.map(category => ({
        ...category,
        ...(include_counts && {
          product_count: (category as any)._count?.products || 0
        })
      }));

      // Remove _count from response
      const cleanCategories = formattedCategories.map(({ _count, ...rest }: any) => rest);

      return successResponse(
        res,
        "Categories retrieved successfully",
        {
          categories: cleanCategories,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: totalCount,
            totalPages: Math.ceil(totalCount / Number(limit))
          }
        },
        200
      );
    } catch (error) {
      console.error("Get all categories error:", error);
      return errorResponse(res, "Failed to retrieve categories", null, 500);
    }
  },

  /**
   * Get a single category by ID
   * GET /api/categories/:categoryId
   * Public access
   */
  getCategoryById: async (req: Request, res: Response) => {
    try {
      const { categoryId } = req.params;
      const { include_counts = false, include_stats = false } = req.query;

      const category = await prisma.categories.findUnique({
        where: { id: categoryId },
        select: {
          id: true,
          name: true,
          description: true,
          is_active: true,
          created_at: true,
          ...(include_counts && {
            _count: {
              select: {
                products: true
              }
            }
          })
        }
      });

      if (!category) {
        return errorResponse(res, "Category not found", null, 404);
      }

      // Add product count if requested
      const response: any = {
        ...category
      };

      if (include_counts) {
        response.product_count = (category as any)._count?.products || 0;
        delete response._count;
      }

      // Add statistics if requested
      if (include_stats) {
        const products = await prisma.products.findMany({
          where: { category_id: categoryId },
          select: { base_price: true }
        });

        if (products.length > 0) {
          const prices = products.map(p => Number(p.base_price));
          response.stats = {
            total_products: products.length,
            min_price: Math.min(...prices),
            max_price: Math.max(...prices),
            avg_price: (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)
          };
        } else {
          response.stats = {
            total_products: 0,
            min_price: 0,
            max_price: 0,
            avg_price: 0
          };
        }
      }

      return successResponse(res, "Category retrieved successfully", response, 200);
    } catch (error) {
      console.error("Get category by ID error:", error);
      return errorResponse(res, "Failed to retrieve category", null, 500);
    }
  },

  /**
   * Get all products in a category (grouped by base product with shop listings)
   * GET /api/categories/:categoryId/products
   * Public access
   */
  getCategoryProducts: async (req: Request, res: Response) => {
    try {
      const { categoryId } = req.params;
      const {
        page = 1,
        limit = 20,
        min_price,
        max_price,
        search,
        sort = "created_desc"
      } = req.query;

      // Check if category exists
      const category = await prisma.categories.findUnique({
        where: { id: categoryId }
      });

      if (!category) {
        return errorResponse(res, "Category not found", null, 404);
      }

      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      // Build where clause for base products
      const where: Prisma.productsWhereInput = {
        category_id: categoryId,
        is_active: true
      };

      // Search filter
      if (search) {
        where.OR = [
          { name: { contains: String(search), mode: "insensitive" } },
          { description: { contains: String(search), mode: "insensitive" } },
          { brand: { contains: String(search), mode: "insensitive" } }
        ];
      }

      // Determine sort order for base products
      let orderBy: Prisma.productsOrderByWithRelationInput = {};
      switch (sort) {
        case "name_asc":
          orderBy = { name: "asc" };
          break;
        case "name_desc":
          orderBy = { name: "desc" };
          break;
        case "created_asc":
          orderBy = { created_at: "asc" };
          break;
        case "created_desc":
          orderBy = { created_at: "desc" };
          break;
        default:
          orderBy = { created_at: "desc" };
      }

      // Fetch base products
      const [baseProducts, totalCount] = await Promise.all([
        prisma.products.findMany({
          where,
          skip,
          take,
          orderBy,
          select: {
            id: true,
            name: true,
            description: true,
            brand: true,
            images: true,
            is_active: true,
            created_at: true
          }
        }),
        prisma.products.count({ where })
      ]);

      // For each base product, get all shop listings with filters
      const groupedProducts = await Promise.all(
        baseProducts.map(async (baseProduct) => {
          // Build where clause for shop products
          const shopProductWhere: Prisma.shop_productsWhereInput = {
            product_id: baseProduct.id,
            listing_status: 'LIVE' as any,
            stock_quantity: { gt: 0 } // Only show products in stock
          };

          // Price filters applied to shop products
          if (min_price || max_price) {
            shopProductWhere.price = {};
            if (min_price) {
              shopProductWhere.price.gte = Number(min_price);
            }
            if (max_price) {
              shopProductWhere.price.lte = Number(max_price);
            }
          }

          // Get shop products for this base product
          const shopProducts = await prisma.shop_products.findMany({
            where: shopProductWhere,
            select: {
              id: true,
              price: true,
              stock_quantity: true,
              created_at: true,
              shops: {
                select: {
                  id: true,
                  name: true,
                  logo: true,
                  city: true,
                  is_verified: true,
                  delivery_methods: true
                }
              }
            },
            orderBy: { price: "asc" } // Sort by price (cheapest first)
          });

          // Calculate price range
          const prices = shopProducts.map(sp => Number(sp.price));
          const minPrice = prices.length > 0 ? Math.min(...prices) : null;
          const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

          // Format shop listings
          const listings = shopProducts.map(sp => ({
            shop_product_id: sp.id,
            price: sp.price,
            stock: sp.stock_quantity,
            shop: {
              id: sp.shops.id,
              name: sp.shops.name,
              logo: sp.shops.logo,
              city: sp.shops.city,
              is_verified: sp.shops.is_verified,
              delivery_methods: sp.shops.delivery_methods
            }
          }));

          return {
            base_product: {
              id: baseProduct.id,
              name: baseProduct.name,
              description: baseProduct.description,
              brand: baseProduct.brand,
              images: baseProduct.images,
              created_at: baseProduct.created_at
            },
            listings: listings,
            price_range: minPrice && maxPrice ? {
              min: minPrice.toString(),
              max: maxPrice.toString()
            } : null,
            total_shops: listings.length,
            lowest_price: minPrice ? minPrice.toString() : null
          };
        })
      );

      // Filter out products with no listings (if price filters eliminated all shops)
      const productsWithListings = groupedProducts.filter(p => p.total_shops > 0);

      return successResponse(
        res,
        "Products retrieved successfully",
        {
          category: {
            id: category.id,
            name: category.name,
            description: category.description
          },
          products: productsWithListings,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: totalCount,
            totalPages: Math.ceil(totalCount / Number(limit)),
            showing: productsWithListings.length
          }
        },
        200
      );
    } catch (error) {
      console.error("Get category products error:", error);
      return errorResponse(res, "Failed to retrieve products", null, 500);
    }
  },

  /**
   * Create a new category
   * POST /api/categories
   * Admin, Super Admin
   */
  createCategory: async (req: Request, res: Response) => {
    try {
      const { name, description } = req.body;

      // Check if category with same name already exists
      const existingCategory = await prisma.categories.findFirst({
        where: {
          name: {
            equals: name,
            mode: "insensitive"
          }
        }
      });

      if (existingCategory) {
        return errorResponse(
          res,
          "A category with this name already exists",
          null,
          409
        );
      }

      // Create category
      const category = await prisma.categories.create({
        data: {
          name,
          description
        }
      });

      return successResponse(res, "Category created successfully", category, 201);
    } catch (error) {
      console.error("Create category error:", error);
      return errorResponse(res, "Failed to create category", null, 500);
    }
  },

  /**
   * Update a category
   * PUT /api/categories/:categoryId
   * Admin, Super Admin
   */
  updateCategory: async (req: Request, res: Response) => {
    try {
      const { categoryId } = req.params;
      const updateData = req.body;

      // Check if category exists
      const existingCategory = await prisma.categories.findUnique({
        where: { id: categoryId }
      });

      if (!existingCategory) {
        return errorResponse(res, "Category not found", null, 404);
      }

      // If updating name, check for duplicates
      if (updateData.name) {
        const duplicateCategory = await prisma.categories.findFirst({
          where: {
            name: {
              equals: updateData.name,
              mode: "insensitive"
            },
            id: {
              not: categoryId
            }
          }
        });

        if (duplicateCategory) {
          return errorResponse(
            res,
            "A category with this name already exists",
            null,
            409
          );
        }
      }

      // Update category
      const updatedCategory = await prisma.categories.update({
        where: { id: categoryId },
        data: { ...updateData, updated_at: new Date() }
      });

      return successResponse(
        res,
        "Category updated successfully",
        updatedCategory,
        200
      );
    } catch (error) {
      console.error("Update category error:", error);
      return errorResponse(res, "Failed to update category", null, 500);
    }
  },

  /**
   * Delete a category
   * DELETE /api/categories/:categoryId
   * Admin, Super Admin
   */
  deleteCategory: async (req: Request, res: Response) => {
    try {
      const { categoryId } = req.params;

      // Check if category exists
      const existingCategory = await prisma.categories.findUnique({
        where: { id: categoryId },
        include: {
          _count: {
            select: {
              products: true
            }
          }
        }
      });

      if (!existingCategory) {
        return errorResponse(res, "Category not found", null, 404);
      }

      // Check if category has products
      if (existingCategory._count.products > 0) {
        return errorResponse(
          res,
          `Cannot delete category. It has ${existingCategory._count.products} product(s) associated with it. Please reassign or delete the products first.`,
          null,
          409
        );
      }

      // Delete category
      await prisma.categories.delete({
        where: { id: categoryId }
      });

      return successResponse(
        res,
        "Category deleted successfully",
        { id: categoryId },
        200
      );
    } catch (error) {
      console.error("Delete category error:", error);
      return errorResponse(res, "Failed to delete category", null, 500);
    }
  }
};
