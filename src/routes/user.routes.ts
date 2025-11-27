import { Router } from "express";
import { userController } from "../controllers/user.controller";
import { protect } from "../middleware/auth.middleware";
import { authorize } from "../middleware/authorize.middleware";
import validateResource from "../middleware/validateResource";
import { uploadSingle } from "../middleware/upload.middleware";
import {
  getProfileSchema,
  updateProfileSchema,
  changePasswordSchema,
  getPublicProfileSchema,
  listUsersSchema,
  getUserSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  deleteUserSchema
} from "../schemas/user.schema";

const router = Router();

// Authenticated user routes
router.get("/profile", protect, userController.getProfile);
router.put(
  "/profile",
  protect,
  validateResource(updateProfileSchema),
  userController.updateProfile
);
router.put(
  "/profile/change-password",
  protect,
  validateResource(changePasswordSchema),
  userController.changePassword
);

// Profile image upload
router.post(
  "/profile/image",
  protect,
  uploadSingle,
  userController.uploadProfileImage
);
router.delete("/profile/image", protect, userController.deleteProfileImage);

// Public seller profile
router.get(
  "/:userId/public",
  validateResource(getPublicProfileSchema),
  userController.getPublicProfile
);

// Admin routes
router.get(
  "/",
  protect,
  authorize("ADMIN"),
  validateResource(listUsersSchema),
  userController.listUsers
);
router.get(
  "/:userId",
  protect,
  authorize("ADMIN"),
  validateResource(getUserSchema),
  userController.getUserById
);
router.put(
  "/:userId/role",
  protect,
  authorize("ADMIN"),
  validateResource(updateUserRoleSchema),
  userController.updateUserRole
);
router.put(
  "/:userId/status",
  protect,
  authorize("ADMIN"),
  validateResource(updateUserStatusSchema),
  userController.updateUserStatus
);
router.delete(
  "/:userId",
  protect,
  authorize("SUPER_ADMIN"),
  validateResource(deleteUserSchema),
  userController.deleteUser
);

export default router;
