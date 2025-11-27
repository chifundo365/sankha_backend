import { Request, Response } from "express";
import prisma from "../prismaClient";
import { errorResponse, successResponse } from "../utils/response";

export const addressController = {
  /**
   * Get all addresses for the authenticated user
   * GET /api/addresses
   * Authenticated user
   */
  getMyAddresses: async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;

      const addresses = await prisma.user_addresses.findMany({
        where: { user_id: userId },
        orderBy: [
          { is_default: "desc" }, // Default address first
          { created_at: "desc" }
        ],
        select: {
          id: true,
          contact_name: true,
          phone_number: true,
          address_line1: true,
          city: true,
          country: true,
          latitude: true,
          longitude: true,
          is_default: true,
          created_at: true,
          updated_at: true
        }
      });

      return successResponse(
        res,
        "Addresses retrieved successfully",
        addresses,
        200
      );
    } catch (error) {
      console.error("Get addresses error:", error);
      return errorResponse(res, "Failed to retrieve addresses", null, 500);
    }
  },

  /**
   * Get a single address by ID
   * GET /api/addresses/:addressId
   * Authenticated user (must own the address)
   */
  getAddressById: async (req: Request, res: Response) => {
    try {
      const { addressId } = req.params;
      const userId = req.user!.id;

      const address = await prisma.user_addresses.findUnique({
        where: { id: addressId },
        select: {
          id: true,
          user_id: true,
          contact_name: true,
          phone_number: true,
          address_line1: true,
          city: true,
          country: true,
          latitude: true,
          longitude: true,
          is_default: true,
          created_at: true,
          updated_at: true
        }
      });

      if (!address) {
        return errorResponse(res, "Address not found", null, 404);
      }

      // Check ownership
      if (
        address.user_id !== userId &&
        req.user!.role !== "ADMIN" &&
        req.user!.role !== "SUPER_ADMIN"
      ) {
        return errorResponse(
          res,
          "You don't have permission to access this address",
          null,
          403
        );
      }

      return successResponse(
        res,
        "Address retrieved successfully",
        address,
        200
      );
    } catch (error) {
      console.error("Get address by ID error:", error);
      return errorResponse(res, "Failed to retrieve address", null, 500);
    }
  },

  /**
   * Create a new address
   * POST /api/addresses
   * Authenticated user
   */
  createAddress: async (req: Request, res: Response) => {
    try {
      const {
        contact_name,
        phone_number,
        address_line1,
        city,
        country = "Malawi",
        latitude,
        longitude,
        is_default = false
      } = req.body;

      const userId = req.user!.id;

      // If this is set as default, unset other default addresses
      if (is_default) {
        await prisma.user_addresses.updateMany({
          where: { user_id: userId, is_default: true },
          data: { is_default: false }
        });
      }

      // If user has no addresses, make this the default
      const existingCount = await prisma.user_addresses.count({
        where: { user_id: userId }
      });

      const shouldBeDefault = is_default || existingCount === 0;

      const address = await prisma.user_addresses.create({
        data: {
          user_id: userId,
          contact_name,
          phone_number,
          address_line1,
          city,
          country,
          latitude,
          longitude,
          is_default: shouldBeDefault
        },
        select: {
          id: true,
          contact_name: true,
          phone_number: true,
          address_line1: true,
          city: true,
          country: true,
          latitude: true,
          longitude: true,
          is_default: true,
          created_at: true,
          updated_at: true
        }
      });

      return successResponse(res, "Address created successfully", address, 201);
    } catch (error) {
      console.error("Create address error:", error);
      return errorResponse(res, "Failed to create address", null, 500);
    }
  },

  /**
   * Update an address
   * PUT /api/addresses/:addressId
   * Authenticated user (must own the address)
   */
  updateAddress: async (req: Request, res: Response) => {
    try {
      const { addressId } = req.params;
      const userId = req.user!.id;
      const updateData = req.body;

      // Check if address exists and user owns it
      const existingAddress = await prisma.user_addresses.findUnique({
        where: { id: addressId }
      });

      if (!existingAddress) {
        return errorResponse(res, "Address not found", null, 404);
      }

      if (
        existingAddress.user_id !== userId &&
        req.user!.role !== "ADMIN" &&
        req.user!.role !== "SUPER_ADMIN"
      ) {
        return errorResponse(
          res,
          "You don't have permission to update this address",
          null,
          403
        );
      }

      // If setting as default, unset other default addresses
      if (updateData.is_default === true) {
        await prisma.user_addresses.updateMany({
          where: { user_id: userId, is_default: true, id: { not: addressId } },
          data: { is_default: false, updated_at: new Date() }
        });
      }

      const updatedAddress = await prisma.user_addresses.update({
        where: { id: addressId },
        data: { ...updateData, updated_at: new Date() },
        select: {
          id: true,
          contact_name: true,
          phone_number: true,
          address_line1: true,
          city: true,
          country: true,
          latitude: true,
          longitude: true,
          is_default: true,
          created_at: true,
          updated_at: true
        }
      });

      return successResponse(
        res,
        "Address updated successfully",
        updatedAddress,
        200
      );
    } catch (error) {
      console.error("Update address error:", error);
      return errorResponse(res, "Failed to update address", null, 500);
    }
  },

  /**
   * Delete an address
   * DELETE /api/addresses/:addressId
   * Authenticated user (must own the address)
   */
  deleteAddress: async (req: Request, res: Response) => {
    try {
      const { addressId } = req.params;
      const userId = req.user!.id;

      // Check if address exists and user owns it
      const existingAddress = await prisma.user_addresses.findUnique({
        where: { id: addressId }
      });

      if (!existingAddress) {
        return errorResponse(res, "Address not found", null, 404);
      }

      if (
        existingAddress.user_id !== userId &&
        req.user!.role !== "ADMIN" &&
        req.user!.role !== "SUPER_ADMIN"
      ) {
        return errorResponse(
          res,
          "You don't have permission to delete this address",
          null,
          403
        );
      }

      // Delete the address
      await prisma.user_addresses.delete({
        where: { id: addressId }
      });

      // If deleted address was default, set another address as default
      if (existingAddress.is_default) {
        const nextAddress = await prisma.user_addresses.findFirst({
          where: { user_id: userId },
          orderBy: { created_at: "desc" }
        });

        if (nextAddress) {
          await prisma.user_addresses.update({
            where: { id: nextAddress.id },
            data: { is_default: true }
          });
        }
      }

      return successResponse(
        res,
        "Address deleted successfully",
        { id: addressId },
        200
      );
    } catch (error) {
      console.error("Delete address error:", error);
      return errorResponse(res, "Failed to delete address", null, 500);
    }
  },

  /**
   * Set an address as default
   * PUT /api/addresses/:addressId/set-default
   * Authenticated user (must own the address)
   */
  setDefaultAddress: async (req: Request, res: Response) => {
    try {
      const { addressId } = req.params;
      const userId = req.user!.id;

      // Check if address exists and user owns it
      const existingAddress = await prisma.user_addresses.findUnique({
        where: { id: addressId }
      });

      if (!existingAddress) {
        return errorResponse(res, "Address not found", null, 404);
      }

      if (existingAddress.user_id !== userId) {
        return errorResponse(
          res,
          "You don't have permission to modify this address",
          null,
          403
        );
      }

      // Unset all other default addresses for this user
      await prisma.user_addresses.updateMany({
        where: { user_id: userId, is_default: true },
        data: { is_default: false, updated_at: new Date() }
      });

      // Set this address as default
      const updatedAddress = await prisma.user_addresses.update({
        where: { id: addressId },
        data: { is_default: true, updated_at: new Date() },
        select: {
          id: true,
          contact_name: true,
          phone_number: true,
          address_line1: true,
          city: true,
          country: true,
          latitude: true,
          longitude: true,
          is_default: true,
          created_at: true,
          updated_at: true
        }
      });

      return successResponse(
        res,
        "Default address updated successfully",
        updatedAddress,
        200
      );
    } catch (error) {
      console.error("Set default address error:", error);
      return errorResponse(res, "Failed to set default address", null, 500);
    }
  }
};
