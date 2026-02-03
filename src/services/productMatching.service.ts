import Fuse, { IFuseOptions } from "fuse.js";
import prisma from "../prismaClient";
import { product_status } from "../../generated/prisma";
import { calculateDisplayPrice } from "../utils/constants";

/**
 * Product Matching Service v4.0
 * 
 * Implements a multi-step hybrid approach for product catalog management:
 * 1. Exact match on normalized name (highest priority)
 * 2. pg_trgm similarity search (if available) or Fuse.js fallback
 * 3. Brand + Category matching
 * 4. Keyword/alias matching
 * 
 * IMPORTANT: Verified products (status = APPROVED) are always prioritized
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Minimum similarity score for fuzzy matching (0.0 - 1.0)
  FUZZY_SIMILARITY_THRESHOLD: parseFloat(process.env.FUZZY_MATCH_THRESHOLD || '0.8'),
  
  // Maximum matches to consider per step
  MAX_CANDIDATES_PER_STEP: 10,
  
  // Boost factors for scoring
  VERIFIED_BOOST: 0.15,      // Add 15% to verified products
  EXACT_MATCH_BOOST: 0.10,   // Add 10% for exact matches
  BRAND_MATCH_BOOST: 0.05,   // Add 5% for brand matches
  CATEGORY_MATCH_BOOST: 0.05 // Add 5% for category matches
};

export interface ProductMatchCandidate {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  score: number;        // 0-1, lower is better match
  confidence: number;   // 0-100%, higher is better
  matchType: "exact" | "fuzzy" | "brand_model" | "gtin" | "keyword" | "alias";
  isVerified?: boolean; // v4.0: Whether product is APPROVED
  finalScore?: number;  // v4.0: Score with boosts applied
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

// v4.0: Advanced matching input
export interface AdvancedMatchInput {
  productName: string;
  normalizedName?: string;
  brand?: string;
  categoryName?: string;
  model?: string;
  keywords?: string[];
}

// v4.0: Advanced matching result
export interface AdvancedMatchResult {
  matched: boolean;
  product: ProductMatchCandidate | null;
  allCandidates: ProductMatchCandidate[];
  matchType: string | null;
  confidence: number;
  explanation?: string;
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

        // Calculate base_price (seller's price) and display price
        const basePrice = options?.shopListingDetails?.price || Number(product.base_price) || 0;
        const displayPrice = calculateDisplayPrice(basePrice);

        // Create shop product listing with dual pricing
        shopProduct = await prisma.shop_products.create({
          data: {
            shop_id: sellerShop.id,
            product_id: productId,
            sku,
            base_price: basePrice,        // Seller's price
            price: displayPrice,           // Display price with markup
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
  updateNormalizedNames,
  
  // ============================================================================
  // v4.0 ADVANCED MATCHING PIPELINE
  // ============================================================================
  
  /**
   * Calculate trigram similarity (Jaccard coefficient)
   * Used as fallback when pg_trgm is not available
   */
  trigramSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;
    
    const getTrigrams = (s: string): Set<string> => {
      const padded = `  ${s.toLowerCase()} `;
      const trigrams = new Set<string>();
      for (let i = 0; i < padded.length - 2; i++) {
        trigrams.add(padded.slice(i, i + 3));
      }
      return trigrams;
    };
    
    const trigrams1 = getTrigrams(str1);
    const trigrams2 = getTrigrams(str2);
    
    let intersection = 0;
    for (const t of trigrams1) {
      if (trigrams2.has(t)) intersection++;
    }
    
    const union = trigrams1.size + trigrams2.size - intersection;
    return union === 0 ? 0 : intersection / union;
  },

  /**
   * Calculate final score with verification boost
   */
  calculateFinalScore(
    similarity: number,
    isVerified: boolean,
    matchType: string,
    brandMatches: boolean,
    categoryMatches: boolean
  ): number {
    let score = similarity;
    
    if (isVerified) score += CONFIG.VERIFIED_BOOST;
    if (matchType === 'exact') score += CONFIG.EXACT_MATCH_BOOST;
    if (brandMatches) score += CONFIG.BRAND_MATCH_BOOST;
    if (categoryMatches) score += CONFIG.CATEGORY_MATCH_BOOST;
    
    return Math.min(score, 1.0);
  },

  /**
   * v4.0: Advanced multi-step matching pipeline
   * 
   * Steps:
   * 1. Exact match on normalized name
   * 2. Fuzzy match with pg_trgm (or local fallback) at 0.8 threshold
   * 3. Brand + Category match
   * 4. Keyword/alias match
   * 
   * IMPORTANT: Verified products (is_verified=true / status=APPROVED) are prioritized
   */
  async findMatchingProductAdvanced(input: AdvancedMatchInput): Promise<AdvancedMatchResult> {
    const normalizedName = input.normalizedName || normalizeProductName(input.productName);
    const inputBrand = input.brand || extractBrand(input.productName);
    
    const allCandidates: ProductMatchCandidate[] = [];

    // =========================================================================
    // STEP 1: Exact Match on Normalized Name
    // =========================================================================
    const exactMatches = await prisma.products.findMany({
      where: {
        OR: [
          { normalized_name: normalizedName },
          { normalized_name: { equals: normalizedName, mode: 'insensitive' } }
        ],
        status: { in: ['APPROVED', 'PENDING'] },
        merged_into_id: null
      },
      include: { categories: true },
      take: CONFIG.MAX_CANDIDATES_PER_STEP
    });

    for (const p of exactMatches) {
      const isVerified = p.status === 'APPROVED';
      const finalScore = this.calculateFinalScore(1.0, isVerified, 'exact', false, false);
      
      allCandidates.push({
        id: p.id,
        name: p.name,
        brand: p.brand,
        model: p.model,
        category: p.categories?.name || null,
        score: 0,
        confidence: 100,
        matchType: 'exact',
        isVerified,
        finalScore
      });
    }

    // If we have a verified exact match, return immediately
    const verifiedExact = allCandidates.find(c => c.isVerified && c.matchType === 'exact');
    if (verifiedExact) {
      return {
        matched: true,
        product: verifiedExact,
        allCandidates,
        matchType: 'exact',
        confidence: verifiedExact.finalScore! * 100,
        explanation: 'Exact match found on verified product'
      };
    }

    // =========================================================================
    // STEP 2: Fuzzy Match using pg_trgm or Local Fallback
    // =========================================================================
    let fuzzyMatches: ProductMatchCandidate[] = [];
    
    try {
      // Try pg_trgm first
      const pgResults = await prisma.$queryRaw<Array<{
        id: string;
        name: string;
        brand: string | null;
        model: string | null;
        category_name: string | null;
        status: string | null;
        similarity: number;
      }>>`
        SELECT 
          p.id, p.name, p.brand, p.model, c.name as category_name, p.status,
          similarity(COALESCE(p.normalized_name, ''), ${normalizedName}) as similarity
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.merged_into_id IS NULL
          AND p.status IN ('APPROVED', 'PENDING')
          AND similarity(COALESCE(p.normalized_name, ''), ${normalizedName}) > ${CONFIG.FUZZY_SIMILARITY_THRESHOLD - 0.15}
        ORDER BY 
          CASE WHEN p.status = 'APPROVED' THEN 0 ELSE 1 END,
          similarity DESC
        LIMIT ${CONFIG.MAX_CANDIDATES_PER_STEP}
      `;

      for (const p of pgResults) {
        const isVerified = p.status === 'APPROVED';
        const brandMatches = inputBrand ? p.brand?.toLowerCase() === inputBrand.toLowerCase() : false;
        const categoryMatches = input.categoryName 
          ? p.category_name?.toLowerCase() === input.categoryName.toLowerCase() 
          : false;
        const finalScore = this.calculateFinalScore(p.similarity, isVerified, 'fuzzy', brandMatches, categoryMatches);
        
        fuzzyMatches.push({
          id: p.id,
          name: p.name,
          brand: p.brand,
          model: p.model,
          category: p.category_name,
          score: 1 - p.similarity,
          confidence: p.similarity * 100,
          matchType: 'fuzzy',
          isVerified,
          finalScore
        });
      }
    } catch (error) {
      // pg_trgm not available, use local fuzzy matching
      console.log('[ProductMatching] pg_trgm not available, using local fuzzy');
      
      const keywords = normalizedName.split(' ').filter(w => w.length > 2);
      if (keywords.length > 0) {
        const candidates = await prisma.products.findMany({
          where: {
            OR: keywords.map(kw => ({ normalized_name: { contains: kw, mode: 'insensitive' } })),
            status: { in: ['APPROVED', 'PENDING'] },
            merged_into_id: null
          },
          include: { categories: true },
          take: 50
        });

        for (const p of candidates) {
          const similarity = this.trigramSimilarity(normalizedName, p.normalized_name || '');
          
          if (similarity >= CONFIG.FUZZY_SIMILARITY_THRESHOLD - 0.15) {
            const isVerified = p.status === 'APPROVED';
            const brandMatches = inputBrand ? p.brand?.toLowerCase() === inputBrand.toLowerCase() : false;
            const categoryMatches = input.categoryName 
              ? p.categories?.name?.toLowerCase() === input.categoryName.toLowerCase() 
              : false;
            const finalScore = this.calculateFinalScore(similarity, isVerified, 'fuzzy', brandMatches, categoryMatches);
            
            fuzzyMatches.push({
              id: p.id,
              name: p.name,
              brand: p.brand,
              model: p.model,
              category: p.categories?.name || null,
              score: 1 - similarity,
              confidence: similarity * 100,
              matchType: 'fuzzy',
              isVerified,
              finalScore
            });
          }
        }
      }
    }

    allCandidates.push(...fuzzyMatches);

    // =========================================================================
    // STEP 3: Brand + Category Match
    // =========================================================================
    if (inputBrand && input.categoryName) {
      const brandCategoryMatches = await prisma.products.findMany({
        where: {
          brand: { equals: inputBrand, mode: 'insensitive' },
          categories: { name: { equals: input.categoryName, mode: 'insensitive' } },
          status: { in: ['APPROVED', 'PENDING'] },
          merged_into_id: null
        },
        include: { categories: true },
        take: CONFIG.MAX_CANDIDATES_PER_STEP
      });

      for (const p of brandCategoryMatches) {
        // Skip if already in candidates
        if (allCandidates.some(c => c.id === p.id)) continue;
        
        const similarity = this.trigramSimilarity(normalizedName, p.normalized_name || '');
        const isVerified = p.status === 'APPROVED';
        const finalScore = this.calculateFinalScore(similarity, isVerified, 'brand_model', true, true);
        
        allCandidates.push({
          id: p.id,
          name: p.name,
          brand: p.brand,
          model: p.model,
          category: p.categories?.name || null,
          score: 1 - similarity,
          confidence: similarity * 100,
          matchType: 'brand_model',
          isVerified,
          finalScore
        });
      }
    }

    // =========================================================================
    // STEP 4: Keyword/Alias Match
    // =========================================================================
    const keywords = [
      ...normalizedName.split(' ').filter(w => w.length > 3),
      ...(input.keywords || [])
    ];

    if (keywords.length > 0) {
      const keywordMatches = await prisma.products.findMany({
        where: {
          OR: [
            { keywords: { hasSome: keywords } },
            { aliases: { hasSome: keywords } }
          ],
          status: { in: ['APPROVED', 'PENDING'] },
          merged_into_id: null
        },
        include: { categories: true },
        take: CONFIG.MAX_CANDIDATES_PER_STEP
      });

      for (const p of keywordMatches) {
        if (allCandidates.some(c => c.id === p.id)) continue;
        
        const similarity = this.trigramSimilarity(normalizedName, p.normalized_name || '');
        const isVerified = p.status === 'APPROVED';
        const finalScore = this.calculateFinalScore(similarity, isVerified, 'keyword', false, false);
        
        allCandidates.push({
          id: p.id,
          name: p.name,
          brand: p.brand,
          model: p.model,
          category: p.categories?.name || null,
          score: 1 - similarity,
          confidence: similarity * 100,
          matchType: 'keyword',
          isVerified,
          finalScore
        });
      }
    }

    // =========================================================================
    // SELECT BEST MATCH
    // =========================================================================
    if (allCandidates.length === 0) {
      return {
        matched: false,
        product: null,
        allCandidates: [],
        matchType: null,
        confidence: 0,
        explanation: 'No matching products found in catalog'
      };
    }

    // Sort: finalScore DESC, then verified first
    allCandidates.sort((a, b) => {
      if ((b.finalScore || 0) !== (a.finalScore || 0)) {
        return (b.finalScore || 0) - (a.finalScore || 0);
      }
      if (a.isVerified !== b.isVerified) {
        return a.isVerified ? -1 : 1;
      }
      return 0;
    });

    // Deduplicate
    const seen = new Set<string>();
    const uniqueCandidates = allCandidates.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    const bestMatch = uniqueCandidates[0];
    
    // Check threshold
    if ((bestMatch.finalScore || 0) < CONFIG.FUZZY_SIMILARITY_THRESHOLD && bestMatch.matchType !== 'exact') {
      return {
        matched: false,
        product: null,
        allCandidates: uniqueCandidates,
        matchType: null,
        confidence: (bestMatch.finalScore || 0) * 100,
        explanation: `Best match "${bestMatch.name}" below threshold (${((bestMatch.finalScore || 0) * 100).toFixed(1)}% < ${CONFIG.FUZZY_SIMILARITY_THRESHOLD * 100}%)`
      };
    }

    return {
      matched: true,
      product: bestMatch,
      allCandidates: uniqueCandidates,
      matchType: bestMatch.matchType,
      confidence: (bestMatch.finalScore || 0) * 100,
      explanation: `Matched via ${bestMatch.matchType}${bestMatch.isVerified ? ' (verified)' : ''} with ${((bestMatch.finalScore || 0) * 100).toFixed(1)}% confidence`
    };
  },

  /**
   * Quick check: Does an exact match exist?
   */
  async hasExactMatch(normalizedName: string): Promise<boolean> {
    const count = await prisma.products.count({
      where: {
        normalized_name: { equals: normalizedName, mode: 'insensitive' },
        merged_into_id: null
      }
    });
    return count > 0;
  },

  /**
   * Get match explanation for debugging/logging
   */
  explainMatch(result: AdvancedMatchResult): string {
    return result.explanation || (result.matched 
      ? `Matched: ${result.product?.name} (${result.matchType})`
      : 'No match found');
  }
};
