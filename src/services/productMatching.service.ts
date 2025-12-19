import Fuse, { IFuseOptions } from "fuse.js";
import prisma from "../prismaClient";
import { product_status } from "../../generated/prisma";

/**
 * Product Matching Service
 * 
 * Implements a hybrid approach for product catalog management:
 * 1. Fuzzy search using Fuse.js for quick local matching
 * 2. Scoring system to rank match confidence
 * 3. Admin queue for pending products
 */

export interface ProductMatchCandidate {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  score: number;        // 0-1, lower is better match
  confidence: number;   // 0-100%, higher is better
  matchType: "exact" | "fuzzy" | "brand_model" | "gtin";
}

export interface ProductMatchResult {
  hasExactMatch: boolean;
  bestMatch: ProductMatchCandidate | null;
  suggestions: ProductMatchCandidate[];
  searchQuery: string;
  normalizedQuery: string;
}

export interface CreateProductInput {
  name: string;
  brand?: string;
  model?: string;
  description?: string;
  category_id?: string;
  base_price?: number;
  images?: string[];
  gtin?: string;
  mpn?: string;
  keywords?: string[];
  aliases?: string[];
}

// Fuse.js configuration for fuzzy matching
const FUSE_OPTIONS: IFuseOptions<any> = {
  keys: [
    { name: "name", weight: 0.4 },
    { name: "normalized_name", weight: 0.3 },
    { name: "brand", weight: 0.15 },
    { name: "model", weight: 0.1 },
    { name: "aliases", weight: 0.05 },
  ],
  threshold: 0.4,         // 0 = exact, 1 = match anything
  distance: 100,          // How far to look for fuzzy matches
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
  shouldSort: true,
};

// Thresholds for auto-matching
const EXACT_MATCH_THRESHOLD = 0.1;    // Score below this = exact match
const HIGH_CONFIDENCE_THRESHOLD = 0.25;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.4;

/**
 * Normalize product name for consistent matching
 */
export function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Remove special characters but keep spaces
    .replace(/[^\w\s]/g, " ")
    // Normalize common variations
    .replace(/\s+/g, " ")
    // Remove common filler words
    .replace(/\b(the|a|an|for|with|and|or)\b/g, "")
    .trim();
}

/**
 * Extract potential brand from product name
 */
export function extractBrand(name: string): string | null {
  const knownBrands = [
    "apple", "samsung", "google", "huawei", "xiaomi", "oppo", "vivo",
    "sony", "lg", "hp", "dell", "lenovo", "asus", "acer", "msi",
    "microsoft", "logitech", "razer", "corsair", "kingston", "sandisk",
    "seagate", "western digital", "wd", "toshiba", "canon", "nikon",
    "jbl", "bose", "beats", "anker", "baseus", "ugreen"
  ];
  
  const lowerName = name.toLowerCase();
  
  for (const brand of knownBrands) {
    if (lowerName.includes(brand)) {
      return brand.charAt(0).toUpperCase() + brand.slice(1);
    }
  }
  
  return null;
}

/**
 * Calculate match confidence percentage
 */
function calculateConfidence(fuseScore: number): number {
  // Fuse score: 0 = perfect match, 1 = no match
  // Convert to confidence: 100 = perfect, 0 = no match
  return Math.round((1 - fuseScore) * 100);
}

/**
 * Search for existing products matching the query
 */
export async function findMatchingProducts(
  query: string,
  options?: {
    brand?: string;
    gtin?: string;
    categoryId?: string;
    limit?: number;
    includeInactive?: boolean;
  }
): Promise<ProductMatchResult> {
  const {
    brand,
    gtin,
    categoryId,
    limit = 5,
    includeInactive = false
  } = options || {};

  const normalizedQuery = normalizeProductName(query);
  
  // First, check for exact GTIN match (barcode)
  if (gtin) {
    const gtinMatch = await prisma.products.findFirst({
      where: { gtin },
      include: { categories: true }
    });
    
    if (gtinMatch) {
      return {
        hasExactMatch: true,
        bestMatch: {
          id: gtinMatch.id,
          name: gtinMatch.name,
          brand: gtinMatch.brand,
          model: gtinMatch.model,
          category: gtinMatch.categories?.name || null,
          score: 0,
          confidence: 100,
          matchType: "gtin"
        },
        suggestions: [],
        searchQuery: query,
        normalizedQuery
      };
    }
  }

  // Build where clause
  const whereClause: any = {
    status: { in: ["APPROVED", "PENDING"] }
  };
  
  if (!includeInactive) {
    whereClause.is_active = true;
  }
  
  if (categoryId) {
    whereClause.category_id = categoryId;
  }

  // Get products for fuzzy matching
  const products = await prisma.products.findMany({
    where: whereClause,
    include: { categories: true },
    take: 500 // Limit for performance
  });

  if (products.length === 0) {
    return {
      hasExactMatch: false,
      bestMatch: null,
      suggestions: [],
      searchQuery: query,
      normalizedQuery
    };
  }

  // Prepare data for Fuse
  const fuseData = products.map(p => ({
    ...p,
    aliases: p.aliases || [],
    keywords: p.keywords || []
  }));

  // Create Fuse instance and search
  const fuse = new Fuse(fuseData, FUSE_OPTIONS);
  
  // Build search query with brand if provided
  const searchQuery = brand 
    ? `${brand} ${query}`.trim()
    : query;
  
  const results = fuse.search(searchQuery);

  // Convert to match candidates
  const suggestions: ProductMatchCandidate[] = results
    .slice(0, limit)
    .map(result => {
      const score = result.score || 1;
      const matchType = score < EXACT_MATCH_THRESHOLD 
        ? "exact" 
        : score < HIGH_CONFIDENCE_THRESHOLD 
          ? "fuzzy" 
          : "fuzzy";
      
      return {
        id: result.item.id,
        name: result.item.name,
        brand: result.item.brand,
        model: result.item.model,
        category: result.item.categories?.name || null,
        score,
        confidence: calculateConfidence(score),
        matchType
      };
    });

  const bestMatch = suggestions.length > 0 ? suggestions[0] : null;
  const hasExactMatch = bestMatch !== null && bestMatch.score < EXACT_MATCH_THRESHOLD;

  return {
    hasExactMatch,
    bestMatch,
    suggestions,
    searchQuery: query,
    normalizedQuery
  };
}

/**
 * Create a new product (pending admin approval)
 */
export async function createPendingProduct(
  input: CreateProductInput,
  createdById: string
): Promise<any> {
  const normalizedName = normalizeProductName(input.name);
  const extractedBrand = input.brand || extractBrand(input.name);

  const product = await prisma.products.create({
    data: {
      name: input.name,
      normalized_name: normalizedName,
      brand: extractedBrand,
      model: input.model,
      description: input.description,
      category_id: input.category_id,
      base_price: input.base_price,
      images: input.images || [],
      gtin: input.gtin,
      mpn: input.mpn,
      keywords: input.keywords || [],
      aliases: input.aliases || [],
      status: "PENDING",
      confidence: null,
      created_by: createdById,
      is_active: false // Not active until approved
    },
    include: { categories: true }
  });

  return product;
}

/**
 * Approve a pending product and optionally add to seller's shop
 */
export async function approveProduct(
  productId: string,
  approvedById: string,
  options?: {
    autoAddToShop?: boolean;
    shopListingDetails?: {
      price?: number;
      stock_quantity?: number;
      condition?: string;
      sku?: string;
      shop_description?: string;
    };
  }
): Promise<{
  product: any;
  shopProduct?: any;
  autoAdded: boolean;
}> {
  // Update product status
  const product = await prisma.products.update({
    where: { id: productId },
    data: {
      status: "APPROVED",
      approved_by: approvedById,
      is_active: true,
      updated_at: new Date()
    },
    include: {
      categories: true,
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

  let shopProduct = null;
  let autoAdded = false;

  // Auto-add to seller's shop if requested and seller exists
  if (options?.autoAddToShop !== false && product.created_by) {
    // Find the seller's shop
    const sellerShop = await prisma.shops.findFirst({
      where: { owner_id: product.created_by }
    });

    if (sellerShop) {
      // Check if product already exists in this shop
      const existingShopProduct = await prisma.shop_products.findFirst({
        where: {
          shop_id: sellerShop.id,
          product_id: productId
        }
      });

      if (!existingShopProduct) {
        // Generate a unique SKU
        const sku = options?.shopListingDetails?.sku || 
          `${product.brand?.substring(0, 3).toUpperCase() || 'PRD'}-${Date.now()}`;

        // Create shop product listing
        shopProduct = await prisma.shop_products.create({
          data: {
            shop_id: sellerShop.id,
            product_id: productId,
            sku,
            price: options?.shopListingDetails?.price || product.base_price || 0,
            stock_quantity: options?.shopListingDetails?.stock_quantity || 0,
            condition: (options?.shopListingDetails?.condition as any) || "NEW",
            shop_description: options?.shopListingDetails?.shop_description || 
              `${product.name} - Now available at ${sellerShop.name}`,
            images: product.images || [],
            is_available: true
          },
          include: {
            shops: {
              select: {
                id: true,
                name: true
              }
            }
          }
        });
        autoAdded = true;
      }
    }
  }

  return {
    product,
    shopProduct,
    autoAdded
  };
}

/**
 * Reject a pending product
 */
export async function rejectProduct(
  productId: string,
  reason: string
): Promise<any> {
  return prisma.products.update({
    where: { id: productId },
    data: {
      status: "REJECTED",
      rejection_reason: reason,
      is_active: false,
      updated_at: new Date()
    }
  });
}

/**
 * Merge a duplicate product into another
 */
export async function mergeProducts(
  duplicateId: string,
  canonicalId: string
): Promise<any> {
  // Update the duplicate to point to canonical
  const merged = await prisma.products.update({
    where: { id: duplicateId },
    data: {
      status: "MERGED",
      merged_into_id: canonicalId,
      is_active: false,
      updated_at: new Date()
    }
  });

  // Update any shop_products pointing to duplicate to point to canonical
  await prisma.shop_products.updateMany({
    where: { product_id: duplicateId },
    data: { product_id: canonicalId }
  });

  return merged;
}

/**
 * Get pending products for admin review
 */
export async function getPendingProducts(
  options?: {
    page?: number;
    limit?: number;
    categoryId?: string;
  }
): Promise<{ products: any[]; total: number; page: number; totalPages: number }> {
  const { page = 1, limit = 20, categoryId } = options || {};
  const skip = (page - 1) * limit;

  const whereClause: any = {
    status: "PENDING"
  };

  if (categoryId) {
    whereClause.category_id = categoryId;
  }

  const [products, total] = await Promise.all([
    prisma.products.findMany({
      where: whereClause,
      include: {
        categories: true,
        created_by_user: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true
          }
        }
      },
      orderBy: { created_at: "desc" },
      skip,
      take: limit
    }),
    prisma.products.count({ where: whereClause })
  ]);

  return {
    products,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * Find potential duplicates for a product
 */
export async function findPotentialDuplicates(
  productId: string,
  limit: number = 5
): Promise<ProductMatchCandidate[]> {
  const product = await prisma.products.findUnique({
    where: { id: productId }
  });

  if (!product) {
    return [];
  }

  const result = await findMatchingProducts(product.name, {
    brand: product.brand || undefined,
    limit: limit + 1 // +1 because it will include itself
  });

  // Filter out the product itself
  return result.suggestions.filter(s => s.id !== productId);
}

/**
 * Update normalized names for existing products (migration helper)
 */
export async function updateNormalizedNames(): Promise<number> {
  const products = await prisma.products.findMany({
    where: {
      normalized_name: null
    }
  });

  let updated = 0;
  
  for (const product of products) {
    await prisma.products.update({
      where: { id: product.id },
      data: {
        normalized_name: normalizeProductName(product.name),
        brand: product.brand || extractBrand(product.name)
      }
    });
    updated++;
  }

  return updated;
}

export const productMatchingService = {
  normalizeProductName,
  extractBrand,
  findMatchingProducts,
  createPendingProduct,
  approveProduct,
  rejectProduct,
  mergeProducts,
  getPendingProducts,
  findPotentialDuplicates,
  updateNormalizedNames
};
