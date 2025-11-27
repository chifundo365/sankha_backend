import { Request, Response } from "express";
import prisma from "../prismaClient";
import bcrypt from "bcrypt";
import { errorResponse, successResponse } from "../utils/response";
import { CloudinaryService } from "../services/cloudinary.service";

export const userController = {
  // Get own profile
  getProfile: async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          phone_number: true,
          profile_image: true,
          role: true,
          is_active: true,
          created_at: true
        }
      });

      if (!user) return errorResponse(res, "User not found", null, 404);

      return successResponse(res, "Profile retrieved successfully", user, 200);
    } catch (error) {
      console.error("Get profile error:", error);
      return errorResponse(res, "Failed to retrieve profile", null, 500);
    }
  },

  // Update own profile
  updateProfile: async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const updateData: any = req.body;

      // Prevent role / is_active / password updates here
      delete updateData.role;
      delete updateData.is_active;
      delete updateData.password_hash;
      delete updateData.password;

      const updated = await prisma.users.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          phone_number: true,
          profile_image: true,
          role: true,
          is_active: true,
          created_at: true
        }
      });

      return successResponse(res, "Profile updated successfully", updated, 200);
    } catch (error) {
      console.error("Update profile error:", error);
      return errorResponse(res, "Failed to update profile", null, 500);
    }
  },

  // Change password
  changePassword: async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { current_password, new_password } = req.body;

      const user = await prisma.users.findUnique({ where: { id: userId } });
      if (!user) return errorResponse(res, "User not found", null, 404);

      const match = await bcrypt.compare(current_password, user.password_hash);
      if (!match)
        return errorResponse(res, "Current password is incorrect", null, 400);

      const hashed = await bcrypt.hash(new_password, 10);
      await prisma.users.update({
        where: { id: userId },
        data: { password_hash: hashed }
      });

      return successResponse(res, "Password changed successfully", null, 200);
    } catch (error) {
      console.error("Change password error:", error);
      return errorResponse(res, "Failed to change password", null, 500);
    }
  },

  // Public seller profile
  getPublicProfile: async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;

      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          profile_image: true,
          created_at: true,
          role: true
        }
      });

      if (!user) return errorResponse(res, "User not found", null, 404);

      // Add extra public info: shop count and rating placeholder
      const shopCount = await prisma.shops.count({
        where: { owner_id: userId }
      });
      const publicProfile: any = {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        profile_image: user.profile_image,
        member_since: user.created_at,
        role: user.role,
        shop_count: shopCount
      };

      return successResponse(
        res,
        "Public profile retrieved",
        publicProfile,
        200
      );
    } catch (error) {
      console.error("Get public profile error:", error);
      return errorResponse(res, "Failed to retrieve public profile", null, 500);
    }
  },

  // Admin: list users
  listUsers: async (req: Request, res: Response) => {
    try {
      const {
        page = 1,
        limit = 20,
        role,
        is_active,
        search
      } = req.query as any;

      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      const where: any = {};
      if (role) where.role = role;
      if (is_active !== undefined)
        where.is_active = is_active === "true" || is_active === true;
      if (search) {
        where.OR = [
          { first_name: { contains: String(search), mode: "insensitive" } },
          { last_name: { contains: String(search), mode: "insensitive" } },
          { email: { contains: String(search), mode: "insensitive" } }
        ];
      }

      const [users, total] = await Promise.all([
        prisma.users.findMany({
          where,
          skip,
          take,
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            role: true,
            is_active: true,
            created_at: true
          }
        }),
        prisma.users.count({ where })
      ]);

      return successResponse(
        res,
        "Users retrieved successfully",
        {
          users,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit))
          }
        },
        200
      );
    } catch (error) {
      console.error("List users error:", error);
      return errorResponse(res, "Failed to list users", null, 500);
    }
  },

  // Admin: get user details
  getUserById: async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          phone_number: true,
          profile_image: true,
          role: true,
          is_active: true,
          created_at: true
        }
      });
      if (!user) return errorResponse(res, "User not found", null, 404);
      return successResponse(res, "User retrieved successfully", user, 200);
    } catch (error) {
      console.error("Get user by id error:", error);
      return errorResponse(res, "Failed to retrieve user", null, 500);
    }
  },

  // Admin: update user role
  updateUserRole: async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;

      const user = await prisma.users.findUnique({ where: { id: userId } });
      if (!user) return errorResponse(res, "User not found", null, 404);

      const updated = await prisma.users.update({
        where: { id: userId },
        data: { role } as any,
        select: { id: true, role: true }
      });
      return successResponse(res, "User role updated", updated, 200);
    } catch (error) {
      console.error("Update user role error:", error);
      return errorResponse(res, "Failed to update user role", null, 500);
    }
  },

  // Admin: update user status (activate/deactivate)
  updateUserStatus: async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { is_active } = req.body;

      const user = await prisma.users.findUnique({ where: { id: userId } });
      if (!user) return errorResponse(res, "User not found", null, 404);

      const updated = await prisma.users.update({
        where: { id: userId },
        data: { is_active },
        select: { id: true, is_active: true }
      });
      return successResponse(res, "User status updated", updated, 200);
    } catch (error) {
      console.error("Update user status error:", error);
      return errorResponse(res, "Failed to update user status", null, 500);
    }
  },

  // Admin / Super Admin: delete user
  deleteUser: async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const user = await prisma.users.findUnique({ where: { id: userId } });
      if (!user) return errorResponse(res, "User not found", null, 404);

      await prisma.users.delete({ where: { id: userId } });
      return successResponse(
        res,
        "User deleted successfully",
        { id: userId },
        200
      );
    } catch (error) {
      console.error("Delete user error:", error);
      return errorResponse(res, "Failed to delete user", null, 500);
    }
  },

  // Upload profile image
  uploadProfileImage: async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      
      if (!req.file) {
        return errorResponse(res, "No image file provided", null, 400);
      }

      // Get current user to check for existing image
      const currentUser = await prisma.users.findUnique({
        where: { id: userId },
        select: { profile_image: true }
      });

      // Delete old image if exists
      if (currentUser?.profile_image) {
        const publicId = CloudinaryService.extractPublicId(currentUser.profile_image);
        if (publicId) {
          await CloudinaryService.deleteImage(publicId);
        }
      }

      // Upload new image
      const uploadResult = await CloudinaryService.uploadImage(
        req.file.buffer,
        'users/profiles',
        `user_${userId}`
      );

      if (!uploadResult.success || !uploadResult.url) {
        return errorResponse(res, uploadResult.error || "Upload failed", null, 500);
      }

      // Update user profile with new image URL
      const updatedUser = await prisma.users.update({
        where: { id: userId },
        data: { profile_image: uploadResult.url },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          profile_image: true
        }
      });

      return successResponse(
        res,
        "Profile image uploaded successfully",
        updatedUser,
        200
      );
    } catch (error) {
      console.error("Upload profile image error:", error);
      return errorResponse(res, "Failed to upload profile image", null, 500);
    }
  },

  // Delete profile image
  deleteProfileImage: async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;

      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { profile_image: true }
      });

      if (!user?.profile_image) {
        return errorResponse(res, "No profile image to delete", null, 404);
      }

      // Delete from Cloudinary
      const publicId = CloudinaryService.extractPublicId(user.profile_image);
      if (publicId) {
        await CloudinaryService.deleteImage(publicId);
      }

      // Update database
      await prisma.users.update({
        where: { id: userId },
        data: { profile_image: null }
      });

      return successResponse(res, "Profile image deleted successfully", null, 200);
    } catch (error) {
      console.error("Delete profile image error:", error);
      return errorResponse(res, "Failed to delete profile image", null, 500);
    }
  }
};
