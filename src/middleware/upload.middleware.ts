import multer, { FileFilterCallback } from "multer";
import { Request } from "express";

// Configure multer to use memory storage
const storage = multer.memoryStorage();

// File filter to accept only images
const imageFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  // Accept only image files
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"));
  }
};

// File filter to accept Excel files
const excelFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'text/csv', // .csv
    'application/octet-stream' // Sometimes sent for binary files
  ];
  
  // Also check file extension
  const validExtensions = ['.xlsx', '.xls', '.csv'];
  const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
  
  if (validTypes.includes(file.mimetype) || validExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only Excel files (.xlsx, .xls) or CSV files are allowed"));
  }
};

// Single file upload middleware
export const uploadSingle = multer({
  storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
}).single("image");

// Multiple files upload middleware (max 5 files)
export const uploadMultiple = multer({
  storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 5 // Maximum 5 files
  }
}).array("images", 5);

// Shop gallery upload (max 10 images)
export const uploadGallery = multer({
  storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 10
  }
}).array("images", 10);

// Excel file upload for bulk operations
export const uploadExcel = multer({
  storage,
  fileFilter: excelFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for Excel files
  }
}).single("file");
