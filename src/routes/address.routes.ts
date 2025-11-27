import { Router } from "express";
import { addressController } from "../controllers/address.controller";
import { protect } from "../middleware/auth.middleware";
import validateResource from "../middleware/validateResource";
import {
  createAddressSchema,
  updateAddressSchema,
  getAddressSchema,
  deleteAddressSchema,
  setDefaultAddressSchema
} from "../schemas/address.schema";

const router = Router();

// All address routes require authentication
router.use(protect);

// Get all my addresses
router.get("/", addressController.getMyAddresses);

// Create a new address
router.post(
  "/",
  validateResource(createAddressSchema),
  addressController.createAddress
);

// Get single address
router.get(
  "/:addressId",
  validateResource(getAddressSchema),
  addressController.getAddressById
);

// Update address
router.put(
  "/:addressId",
  validateResource(updateAddressSchema),
  addressController.updateAddress
);

// Delete address
router.delete(
  "/:addressId",
  validateResource(deleteAddressSchema),
  addressController.deleteAddress
);

// Set default address
router.put(
  "/:addressId/set-default",
  validateResource(setDefaultAddressSchema),
  addressController.setDefaultAddress
);

export default router;
