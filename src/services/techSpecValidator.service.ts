/**
 * Tech Spec Validator Service v4.0
 * =================================
 * Validates variant values against category-specific spec requirements.
 * Normalizes spec values for consistent filtering and comparison.
 */

import prisma from '../prismaClient';
import {
  TechSpecRule,
  SpecValidation,
  SpecValidationResult,
  ListingStatusV4,
  TECH_CATEGORIES,
  DEFAULT_SPEC_REQUIREMENTS,
  SPEC_NORMALIZERS,
  normalizeSpecKey,
  normalizeMemorySize,
  normalizeStorageSize,
  normalizeScreenSize
} from '../types/bulkUpload.types';

// Cache for spec rules (loaded from DB)
let specRulesCache: Map<string, TechSpecRule> = new Map();
let specRulesByCategoryName: Map<string, TechSpecRule> = new Map();
let cacheLoadedAt: Date | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Tech Spec Validator Service
 */
export const techSpecValidator = {
  /**
   * Load spec rules from database into cache
   */
  async loadRules(): Promise<void> {
    try {
      const rules = await prisma.$queryRaw<Array<{
        id: string;
        category_id: string;
        category_name: string;
        required_specs: string[];
        optional_specs: string[];
        spec_labels: Record<string, string>;
        spec_validations: Record<string, SpecValidation> | null;
        is_active: boolean;
      }>>`
        SELECT 
          id,
          category_id,
          category_name,
          required_specs,
          optional_specs,
          spec_labels,
          spec_validations,
          is_active
        FROM tech_spec_rules
        WHERE is_active = true
      `;

      specRulesCache.clear();
      specRulesByCategoryName.clear();

      for (const rule of rules) {
        const techRule: TechSpecRule = {
          id: rule.id,
          categoryId: rule.category_id,
          categoryName: rule.category_name,
          requiredSpecs: rule.required_specs || [],
          optionalSpecs: rule.optional_specs || [],
          specLabels: rule.spec_labels || {},
          specValidations: rule.spec_validations || undefined,
          isActive: rule.is_active
        };

        specRulesCache.set(rule.category_id, techRule);
        specRulesByCategoryName.set(rule.category_name.toLowerCase(), techRule);
      }

      cacheLoadedAt = new Date();
      console.log(`[TechSpecValidator] Loaded ${rules.length} spec rules into cache`);
    } catch (error) {
      console.error('[TechSpecValidator] Failed to load rules from DB, using defaults:', error);
      // Fall back to default rules
      this.loadDefaultRules();
    }
  },

  /**
   * Load default rules (fallback when DB is empty or unavailable)
   */
  loadDefaultRules(): void {
    specRulesCache.clear();
    specRulesByCategoryName.clear();

    for (const [category, specs] of Object.entries(DEFAULT_SPEC_REQUIREMENTS)) {
      const rule: TechSpecRule = {
        id: `default-${category}`,
        categoryId: `default-${category}`,
        categoryName: category,
        requiredSpecs: specs.required,
        optionalSpecs: specs.optional,
        specLabels: {},
        isActive: true
      };

      specRulesByCategoryName.set(category.toLowerCase(), rule);
    }

    console.log(`[TechSpecValidator] Loaded ${specRulesByCategoryName.size} default rules`);
  },

  /**
   * Ensure rules are loaded and fresh
   */
  async ensureRulesLoaded(): Promise<void> {
    const now = new Date();
    
    if (
      !cacheLoadedAt ||
      now.getTime() - cacheLoadedAt.getTime() > CACHE_TTL_MS ||
      specRulesCache.size === 0
    ) {
      await this.loadRules();
    }
  },

  /**
   * Check if a category is a tech category
   */
  isTechCategory(categoryName: string | null | undefined): boolean {
    if (!categoryName) return false;

    const normalized = categoryName.toLowerCase().trim();

    // Check if it matches any tech category pattern
    return TECH_CATEGORIES.some(techCat => {
      return normalized.includes(techCat) || techCat.includes(normalized);
    });
  },

  /**
   * Get spec rule for a category
   */
  async getRuleForCategory(
    categoryId?: string | null,
    categoryName?: string | null
  ): Promise<TechSpecRule | null> {
    await this.ensureRulesLoaded();

    // Try by ID first
    if (categoryId && specRulesCache.has(categoryId)) {
      return specRulesCache.get(categoryId)!;
    }

    // Try by name
    if (categoryName) {
      const normalizedName = categoryName.toLowerCase().trim();
      
      if (specRulesByCategoryName.has(normalizedName)) {
        return specRulesByCategoryName.get(normalizedName)!;
      }

      // Try partial match
      for (const [key, rule] of specRulesByCategoryName) {
        if (normalizedName.includes(key) || key.includes(normalizedName)) {
          return rule;
        }
      }
    }

    // Check if it's a tech category and use default rules
    if (categoryName && this.isTechCategory(categoryName)) {
      // Find matching default
      const normalized = categoryName.toLowerCase();
      
      for (const techCat of TECH_CATEGORIES) {
        if (normalized.includes(techCat) || techCat.includes(normalized)) {
          const defaultRule = DEFAULT_SPEC_REQUIREMENTS[techCat];
          
          if (defaultRule) {
            return {
              id: `default-${techCat}`,
              categoryId: '',
              categoryName: techCat,
              requiredSpecs: defaultRule.required,
              optionalSpecs: defaultRule.optional,
              specLabels: {},
              isActive: true
            };
          }
        }
      }
    }

    return null;
  },

  /**
   * Normalize a spec value based on spec key
   */
  normalizeSpecValue(key: string, value: string): string {
    const normalizedKey = normalizeSpecKey(key);
    const normalizer = SPEC_NORMALIZERS[normalizedKey];

    if (normalizer) {
      return normalizer(value);
    }

    // Default normalization: trim and clean
    return value.trim();
  },

  /**
   * Normalize all variant values
   */
  normalizeVariantValues(
    variantValues: Record<string, string> | null | undefined
  ): Record<string, string> {
    if (!variantValues) return {};

    const normalized: Record<string, string> = {};

    for (const [key, value] of Object.entries(variantValues)) {
      if (value && typeof value === 'string' && value.trim()) {
        const normalizedKey = normalizeSpecKey(key);
        const normalizedValue = this.normalizeSpecValue(key, value);
        normalized[normalizedKey] = normalizedValue;
      }
    }

    return normalized;
  },

  /**
   * Validate a single spec value against validation rules
   */
  validateSpecValue(
    specKey: string,
    value: string,
    validation: SpecValidation
  ): string | null {
    // Type validation
    if (validation.type === 'number') {
      const num = parseFloat(value.replace(/[^\d.-]/g, ''));
      if (isNaN(num)) {
        return `${specKey} must be a number`;
      }
      if (validation.min !== undefined && num < validation.min) {
        return `${specKey} must be at least ${validation.min}`;
      }
      if (validation.max !== undefined && num > validation.max) {
        return `${specKey} must be at most ${validation.max}`;
      }
    }

    // Pattern validation
    if (validation.pattern) {
      const regex = new RegExp(validation.pattern, 'i');
      if (!regex.test(value)) {
        return `${specKey} has invalid format`;
      }
    }

    // Enum validation
    if (validation.enum && validation.enum.length > 0) {
      const normalizedValue = value.toLowerCase().trim();
      const normalizedEnum = validation.enum.map(e => e.toLowerCase().trim());
      
      if (!normalizedEnum.includes(normalizedValue)) {
        return `${specKey} must be one of: ${validation.enum.join(', ')}`;
      }
    }

    return null; // Valid
  },

  /**
   * Main validation function: Validate variant values against category rules
   */
  async validateSpecs(
    categoryId: string | null | undefined,
    categoryName: string | null | undefined,
    variantValues: Record<string, string> | null | undefined
  ): Promise<SpecValidationResult> {
    // Default result for non-tech categories
    const defaultResult: SpecValidationResult = {
      isTechCategory: false,
      missingRequired: [],
      invalidSpecs: [],
      normalizedValues: this.normalizeVariantValues(variantValues),
      targetStatus: ListingStatusV4.NEEDS_IMAGES
    };

    // Get rule for this category
    const rule = await this.getRuleForCategory(categoryId, categoryName);

    if (!rule) {
      // Not a tech category - just normalize values
      return defaultResult;
    }

    // This is a tech category
    const result: SpecValidationResult = {
      isTechCategory: true,
      categoryId: rule.categoryId,
      categoryName: rule.categoryName,
      missingRequired: [],
      invalidSpecs: [],
      normalizedValues: {},
      targetStatus: ListingStatusV4.NEEDS_IMAGES
    };

    // Normalize all values
    const normalized = this.normalizeVariantValues(variantValues);
    result.normalizedValues = normalized;

    // Check required specs
    for (const requiredSpec of rule.requiredSpecs) {
      const normalizedKey = normalizeSpecKey(requiredSpec);
      const value = normalized[normalizedKey];

      if (!value || value.trim() === '') {
        result.missingRequired.push(requiredSpec);
      } else if (rule.specValidations?.[normalizedKey]) {
        // Validate the value format
        const error = this.validateSpecValue(
          normalizedKey,
          value,
          rule.specValidations[normalizedKey]
        );
        
        if (error) {
          result.invalidSpecs.push({ spec: normalizedKey, error });
        }
      }
    }

    // Validate optional specs that are provided
    for (const [key, value] of Object.entries(normalized)) {
      if (!rule.requiredSpecs.includes(key) && rule.specValidations?.[key]) {
        const error = this.validateSpecValue(
          key,
          value,
          rule.specValidations[key]
        );
        
        if (error) {
          result.invalidSpecs.push({ spec: key, error });
        }
      }
    }

    // Determine target status
    if (result.missingRequired.length > 0) {
      result.targetStatus = ListingStatusV4.NEEDS_SPECS;
    } else if (result.invalidSpecs.length > 0) {
      result.targetStatus = ListingStatusV4.NEEDS_SPECS;
    } else {
      result.targetStatus = ListingStatusV4.NEEDS_IMAGES;
    }

    return result;
  },

  /**
   * Get human-readable labels for specs
   */
  async getSpecLabels(
    categoryId: string | null | undefined,
    categoryName: string | null | undefined,
    specKeys: string[]
  ): Promise<Record<string, string>> {
    const rule = await this.getRuleForCategory(categoryId, categoryName);
    const labels: Record<string, string> = {};

    for (const key of specKeys) {
      const normalizedKey = normalizeSpecKey(key);
      
      if (rule?.specLabels[normalizedKey]) {
        labels[key] = rule.specLabels[normalizedKey];
      } else {
        // Generate label from key
        labels[key] = key
          .replace(/_/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
      }
    }

    return labels;
  },

  /**
   * Get required specs for a category
   */
  async getRequiredSpecs(
    categoryId: string | null | undefined,
    categoryName: string | null | undefined
  ): Promise<string[]> {
    const rule = await this.getRuleForCategory(categoryId, categoryName);
    return rule?.requiredSpecs || [];
  },

  /**
   * Check if all required specs are present
   */
  async hasAllRequiredSpecs(
    categoryId: string | null | undefined,
    categoryName: string | null | undefined,
    variantValues: Record<string, string> | null | undefined
  ): Promise<boolean> {
    const result = await this.validateSpecs(categoryId, categoryName, variantValues);
    return result.missingRequired.length === 0;
  },

  /**
   * Get summary of what's missing for a product
   */
  async getMissingSummary(
    categoryId: string | null | undefined,
    categoryName: string | null | undefined,
    variantValues: Record<string, string> | null | undefined
  ): Promise<{
    isTechCategory: boolean;
    missingSpecs: string[];
    missingLabels: string[];
    percentComplete: number;
  }> {
    const rule = await this.getRuleForCategory(categoryId, categoryName);

    if (!rule) {
      return {
        isTechCategory: false,
        missingSpecs: [],
        missingLabels: [],
        percentComplete: 100
      };
    }

    const normalized = this.normalizeVariantValues(variantValues);
    const missingSpecs: string[] = [];

    for (const requiredSpec of rule.requiredSpecs) {
      const normalizedKey = normalizeSpecKey(requiredSpec);
      if (!normalized[normalizedKey]) {
        missingSpecs.push(requiredSpec);
      }
    }

    const labels = await this.getSpecLabels(categoryId, categoryName, missingSpecs);
    const totalRequired = rule.requiredSpecs.length;
    const filled = totalRequired - missingSpecs.length;
    const percentComplete = totalRequired > 0 
      ? Math.round((filled / totalRequired) * 100) 
      : 100;

    return {
      isTechCategory: true,
      missingSpecs,
      missingLabels: missingSpecs.map(s => labels[s] || s),
      percentComplete
    };
  },

  /**
   * Bulk validate multiple rows
   */
  async validateBatch(
    rows: Array<{
      rowNumber: number;
      categoryId?: string;
      categoryName?: string;
      variantValues?: Record<string, string>;
    }>
  ): Promise<Map<number, SpecValidationResult>> {
    await this.ensureRulesLoaded();
    
    const results = new Map<number, SpecValidationResult>();

    for (const row of rows) {
      const result = await this.validateSpecs(
        row.categoryId,
        row.categoryName,
        row.variantValues
      );
      results.set(row.rowNumber, result);
    }

    return results;
  },

  /**
   * Clear the rules cache
   */
  clearCache(): void {
    specRulesCache.clear();
    specRulesByCategoryName.clear();
    cacheLoadedAt = null;
    console.log('[TechSpecValidator] Cache cleared');
  },

  /**
   * Add or update a spec rule (admin function)
   */
  async upsertRule(
    categoryId: string,
    categoryName: string,
    requiredSpecs: string[],
    optionalSpecs: string[] = [],
    specLabels: Record<string, string> = {}
  ): Promise<TechSpecRule> {
    const result = await prisma.$queryRaw<Array<{
      id: string;
      category_id: string;
      category_name: string;
      required_specs: string[];
      optional_specs: string[];
      spec_labels: Record<string, string>;
      is_active: boolean;
    }>>`
      INSERT INTO tech_spec_rules (category_id, category_name, required_specs, optional_specs, spec_labels)
      VALUES (${categoryId}::uuid, ${categoryName}, ${JSON.stringify(requiredSpecs)}::jsonb, ${JSON.stringify(optionalSpecs)}::jsonb, ${JSON.stringify(specLabels)}::jsonb)
      ON CONFLICT (category_id) 
      DO UPDATE SET 
        category_name = EXCLUDED.category_name,
        required_specs = EXCLUDED.required_specs,
        optional_specs = EXCLUDED.optional_specs,
        spec_labels = EXCLUDED.spec_labels,
        updated_at = NOW()
      RETURNING *
    `;

    // Invalidate cache
    this.clearCache();

    const rule = result[0];
    return {
      id: rule.id,
      categoryId: rule.category_id,
      categoryName: rule.category_name,
      requiredSpecs: rule.required_specs,
      optionalSpecs: rule.optional_specs,
      specLabels: rule.spec_labels,
      isActive: rule.is_active
    };
  }
};

export default techSpecValidator;
