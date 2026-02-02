/**
 * Localized Error Messages v4.0
 * ==============================
 * Bilingual error messages (English + Chichewa) for seller-facing feedback.
 * Used by Correction CSV Generator and Dashboard notifications.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

// ============================================================================
// ERROR CODES
// ============================================================================

export type ErrorCode =
  // Price/Stock Errors
  | 'MISSING_PRICE'
  | 'INVALID_PRICE'
  | 'INVALID_STOCK'
  
  // Product Identification Errors
  | 'MISSING_PRODUCT_NAME'
  | 'DUPLICATE_PRODUCT'
  | 'DUPLICATE_SKU'
  | 'INVALID_SKU'
  
  // Spec Errors
  | 'MISSING_TECH_SPECS'
  | 'MISSING_RAM'
  | 'MISSING_STORAGE'
  | 'MISSING_SCREEN_SIZE'
  | 'MISSING_PROCESSOR'
  | 'INVALID_SPEC_FORMAT'
  
  // Category/Condition Errors
  | 'INVALID_CATEGORY'
  | 'INVALID_CONDITION'
  
  // Image Errors
  | 'MISSING_IMAGES'
  | 'INVALID_IMAGE_URL'
  | 'IMAGE_TOO_LARGE'
  
  // Format/Parse Errors
  | 'INVALID_JSON_FORMAT'
  | 'FILE_PARSE_ERROR'
  | 'ROW_TOO_LONG'
  
  // System Errors
  | 'UNKNOWN_ERROR'
  | 'SYSTEM_ERROR';

// ============================================================================
// ERROR MESSAGE DEFINITIONS
// ============================================================================

interface LocalizedMessage {
  en: string;
  ny: string; // Chichewa
  severity: 'error' | 'warning' | 'info';
  fixHint?: {
    en: string;
    ny: string;
  };
}

export const errorMessages: Record<ErrorCode, LocalizedMessage> = {
  // ===== Price/Stock Errors =====
  MISSING_PRICE: {
    en: 'Base price is required',
    ny: 'Mtengo woyambira ndi wofunikira',
    severity: 'error',
    fixHint: {
      en: 'Enter a positive number in the "Base Price (MWK)" column',
      ny: 'Lembani nambala yabwino mu kolamu ya "Base Price (MWK)"'
    }
  },
  
  INVALID_PRICE: {
    en: 'Price must be a positive number',
    ny: 'Mtengo uyenera kukhala nambala yabwino',
    severity: 'error',
    fixHint: {
      en: 'Remove any letters or symbols. Use only numbers (e.g., 150000)',
      ny: 'Chotsani zilembo kapena zizindikiro. Gwiritsani ntchito manambala okha'
    }
  },
  
  INVALID_STOCK: {
    en: 'Stock quantity must be a non-negative number',
    ny: 'Kuchuluka kwa katundu kuyenera kukhala nambala yosachepera zero',
    severity: 'error',
    fixHint: {
      en: 'Enter 0 or a positive whole number',
      ny: 'Lembani 0 kapena nambala yabwino'
    }
  },

  // ===== Product Identification Errors =====
  MISSING_PRODUCT_NAME: {
    en: 'Product name is required',
    ny: 'Dzina la katundu ndilofunikira',
    severity: 'error',
    fixHint: {
      en: 'Enter the full product name (e.g., "iPhone 15 Pro Max 256GB")',
      ny: 'Lembani dzina lonse la katundu'
    }
  },
  
  DUPLICATE_PRODUCT: {
    en: 'This product already exists in your shop',
    ny: 'Katundu ameneyu alipo kale m\'sitolo yanu',
    severity: 'warning',
    fixHint: {
      en: 'Remove this row or update the existing product instead',
      ny: 'Chotsani mzere uwu kapena sinthani katundu womwe ulipo'
    }
  },
  
  DUPLICATE_SKU: {
    en: 'This SKU already exists in your shop',
    ny: 'SKU imeneyi ilipo kale m\'sitolo yanu',
    severity: 'error',
    fixHint: {
      en: 'Use a unique SKU or leave blank for auto-generation',
      ny: 'Gwiritsani ntchito SKU yapadera kapena siyani yopanda kanthu'
    }
  },
  
  INVALID_SKU: {
    en: 'SKU format is invalid',
    ny: 'SKU ili ndi mavuto',
    severity: 'warning',
    fixHint: {
      en: 'Use letters, numbers, and hyphens only (e.g., "IP15-256-BLK")',
      ny: 'Gwiritsani ntchito zilembo, manambala, ndi ma-hyphen okha'
    }
  },

  // ===== Spec Errors =====
  MISSING_TECH_SPECS: {
    en: 'Missing required specs for tech item',
    ny: 'Chonde lembani mndandanda wa katunduyu',
    severity: 'error',
    fixHint: {
      en: 'Electronics require: Storage, RAM, Screen Size. Fill in the Spec columns.',
      ny: 'Zida zamagetsi zimafunikira: Kukumbukira, RAM, Kukula kwa Sikiliini'
    }
  },
  
  MISSING_RAM: {
    en: 'RAM specification is required for this category',
    ny: 'RAM ndiyofunikira pa gulu limeneli',
    severity: 'error',
    fixHint: {
      en: 'Enter RAM size (e.g., "8GB", "16GB")',
      ny: 'Lembani kukula kwa RAM (mwachitsanzo, "8GB")'
    }
  },
  
  MISSING_STORAGE: {
    en: 'Storage specification is required for this category',
    ny: 'Kukumbukira ndikofunikira pa gulu limeneli',
    severity: 'error',
    fixHint: {
      en: 'Enter storage size (e.g., "256GB", "1TB")',
      ny: 'Lembani kukula kwa kukumbukira (mwachitsanzo, "256GB")'
    }
  },
  
  MISSING_SCREEN_SIZE: {
    en: 'Screen size is required for this category',
    ny: 'Kukula kwa sikiliini ndikofunikira',
    severity: 'error',
    fixHint: {
      en: 'Enter screen size in inches (e.g., "6.7\\"", "15.6\\"")',
      ny: 'Lembani kukula kwa sikiliini mu inches'
    }
  },
  
  MISSING_PROCESSOR: {
    en: 'Processor/CPU specification is required',
    ny: 'Processor/CPU ndiyofunikira',
    severity: 'error',
    fixHint: {
      en: 'Enter processor name (e.g., "A17 Pro", "Snapdragon 8 Gen 3")',
      ny: 'Lembani dzina la processor'
    }
  },
  
  INVALID_SPEC_FORMAT: {
    en: 'Specification format is invalid',
    ny: 'Mndandanda uli ndi mavuto',
    severity: 'warning',
    fixHint: {
      en: 'Check that spec values are correctly formatted',
      ny: 'Onetsetsani kuti mndandanda walembedwa bwino'
    }
  },

  // ===== Category/Condition Errors =====
  INVALID_CATEGORY: {
    en: 'Category not found in our catalog',
    ny: 'Gulu silinapezekedwe mu katalogi yathu',
    severity: 'warning',
    fixHint: {
      en: 'Use a valid category name (Smartphones, Laptops, Tablets, etc.)',
      ny: 'Gwiritsani ntchito dzina la gulu loyenera'
    }
  },
  
  INVALID_CONDITION: {
    en: 'Invalid product condition',
    ny: 'Mkhalidwe wa katundu ndi wolakwika',
    severity: 'error',
    fixHint: {
      en: 'Use: NEW, REFURBISHED, USED_LIKE_NEW, USED_GOOD, or USED_FAIR',
      ny: 'Gwiritsani ntchito: NEW, REFURBISHED, USED_LIKE_NEW, USED_GOOD, kapena USED_FAIR'
    }
  },

  // ===== Image Errors =====
  MISSING_IMAGES: {
    en: 'Product images are required',
    ny: 'Zithunzi za katundu ndizofunikira',
    severity: 'error',
    fixHint: {
      en: 'Upload at least one product image after fixing other errors',
      ny: 'Tumizani chithunzi chimodzi kapena zambiri atakonza zolakwika zina'
    }
  },
  
  INVALID_IMAGE_URL: {
    en: 'Image URL is invalid',
    ny: 'URL ya chithunzi ndi yolakwika',
    severity: 'error',
    fixHint: {
      en: 'Provide a valid image URL starting with http:// or https://',
      ny: 'Perekani URL yabwino yomwe ikuyamba ndi http:// kapena https://'
    }
  },
  
  IMAGE_TOO_LARGE: {
    en: 'Image file is too large',
    ny: 'Fayilo ya chithunzi ndi yayikulu kwambiri',
    severity: 'error',
    fixHint: {
      en: 'Maximum image size is 5MB. Compress the image and try again.',
      ny: 'Chithunzi chachikulu kwambiri ndi 5MB. Pangani chithunzi chaching\'ono'
    }
  },

  // ===== Format/Parse Errors =====
  INVALID_JSON_FORMAT: {
    en: 'Invalid JSON format in specs column',
    ny: 'JSON mu kolamu ya specs ili ndi mavuto',
    severity: 'error',
    fixHint: {
      en: 'Use the Spec: columns instead of JSON for easier input',
      ny: 'Gwiritsani ntchito makolamu a Spec: m\'malo mwa JSON'
    }
  },
  
  FILE_PARSE_ERROR: {
    en: 'Could not read the uploaded file',
    ny: 'Sitingathe kuwerenga fayilo yomwe mwatumiza',
    severity: 'error',
    fixHint: {
      en: 'Ensure the file is a valid Excel (.xlsx) or CSV file',
      ny: 'Onetsetsani kuti fayilo ndi Excel (.xlsx) kapena CSV yabwino'
    }
  },
  
  ROW_TOO_LONG: {
    en: 'Row contains too much data',
    ny: 'Mzere uli ndi deta yochuluka kwambiri',
    severity: 'warning',
    fixHint: {
      en: 'Keep descriptions under 1000 characters',
      ny: 'Sungani kufotokozera pansi pa zilembo 1000'
    }
  },

  // ===== System Errors =====
  UNKNOWN_ERROR: {
    en: 'An unknown error occurred',
    ny: 'Vuto losadziwika linachitika',
    severity: 'error',
    fixHint: {
      en: 'Please contact support if this persists',
      ny: 'Chonde lumikizanani ndi thandizo ngati izi zikupitilira'
    }
  },
  
  SYSTEM_ERROR: {
    en: 'A system error occurred. Please try again.',
    ny: 'Vuto la sisitemu linachitika. Chonde yesaninso.',
    severity: 'error',
    fixHint: {
      en: 'If the problem persists, contact support',
      ny: 'Ngati vutoli likupitilira, lumikizanani ndi thandizo'
    }
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get localized error message
 */
export function getLocalizedError(
  code: ErrorCode,
  language: 'en' | 'ny' = 'en'
): string {
  const message = errorMessages[code];
  if (!message) {
    return errorMessages.UNKNOWN_ERROR[language];
  }
  return message[language];
}

/**
 * Get error with fix hint
 */
export function getErrorWithHint(
  code: ErrorCode,
  language: 'en' | 'ny' = 'en'
): { message: string; hint: string; severity: string } {
  const error = errorMessages[code] || errorMessages.UNKNOWN_ERROR;
  
  return {
    message: error[language],
    hint: error.fixHint?.[language] || '',
    severity: error.severity
  };
}

/**
 * Get all errors for a list of codes
 */
export function getLocalizedErrors(
  codes: ErrorCode[],
  language: 'en' | 'ny' = 'en'
): string[] {
  return codes.map(code => getLocalizedError(code, language));
}

/**
 * Format error for display (combines message and hint)
 */
export function formatErrorForDisplay(
  code: ErrorCode,
  language: 'en' | 'ny' = 'en'
): string {
  const { message, hint } = getErrorWithHint(code, language);
  
  if (hint) {
    return `${message} — ${hint}`;
  }
  return message;
}

/**
 * Get bilingual error message (both languages in one string)
 */
export function getBilingualError(code: ErrorCode): string {
  const en = getLocalizedError(code, 'en');
  const ny = getLocalizedError(code, 'ny');
  return `${en} / ${ny}`;
}

/**
 * Map spec name to missing spec error code
 */
export function specToErrorCode(specName: string): ErrorCode {
  const spec = specName.toLowerCase();
  
  if (spec.includes('ram') || spec.includes('memory')) {
    return 'MISSING_RAM';
  }
  if (spec.includes('storage') || spec.includes('ssd') || spec.includes('hdd')) {
    return 'MISSING_STORAGE';
  }
  if (spec.includes('screen') || spec.includes('display')) {
    return 'MISSING_SCREEN_SIZE';
  }
  if (spec.includes('processor') || spec.includes('cpu') || spec.includes('chip')) {
    return 'MISSING_PROCESSOR';
  }
  
  return 'MISSING_TECH_SPECS';
}

/**
 * Generate notification message for dashboard
 */
export function generateDashboardNotification(
  status: 'NEEDS_SPECS' | 'NEEDS_IMAGES' | 'BROKEN',
  count: number,
  language: 'en' | 'ny' = 'en'
): { title: string; description: string; action: string } {
  const messages = {
    NEEDS_SPECS: {
      en: {
        title: `${count} products need specifications`,
        description: 'These items are missing required technical details',
        action: 'Add Specs'
      },
      ny: {
        title: `Katundu ${count} akufunika mndandanda`,
        description: 'Zinthu izi zilibe mndandanda wa zamagetsi wofunikira',
        action: 'Onjezani Specs'
      }
    },
    NEEDS_IMAGES: {
      en: {
        title: `${count} products need images`,
        description: 'Upload photos to make these products visible to buyers',
        action: 'Add Images'
      },
      ny: {
        title: `Katundu ${count} akufunika zithunzi`,
        description: 'Tumizani zithunzi kuti katunduyu awonekere kwa ogula',
        action: 'Onjezani Zithunzi'
      }
    },
    BROKEN: {
      en: {
        title: `${count} uploads failed`,
        description: 'Download the correction file and fix the errors',
        action: 'Download Corrections'
      },
      ny: {
        title: `Kutumiza ${count} kwalephera`,
        description: 'Tsitsani fayilo yokonza ndikukonza zolakwika',
        action: 'Tsitsani Zokonza'
      }
    }
  };

  return messages[status][language];
}

export default {
  errorMessages,
  getLocalizedError,
  getErrorWithHint,
  getLocalizedErrors,
  formatErrorForDisplay,
  getBilingualError,
  specToErrorCode,
  generateDashboardNotification
};
