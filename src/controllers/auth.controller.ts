import { Request, Response } from "express";
import bcrypt from "bcrypt";
import prisma from "../prismaClient";
import { errorResponse, successResponse } from "../utils/response";
import * as jwt from "jsonwebtoken";

export const authController = {
  register: async (req: Request, res: Response) => {
    try {
      const {
        first_name,
        last_name,
        email,
        phone_number,
        password,
        role
      } = req.body;

      // Check if user with the same email already exists
      const existingUser = await prisma.users.findUnique({
        where: { email }
      });

      if (existingUser) {
        return errorResponse(
          res,
          "User with this email already exists",
          null,
          409
        );
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const newUser = await prisma.users.create({
        data: {
          first_name,
          last_name,
          email,
          phone_number,
          password_hash: hashedPassword,
          role: role || "USER" // Default to USER role if not provided
        }
      });

      // Remove password_hash from response
      const { password_hash, ...userWithoutPassword } = newUser;

      return successResponse(
        res,
        "User registered successfully",
        userWithoutPassword
      );
    } catch (error) {
      console.log(error);
      return errorResponse(res, "User registration failed", null, 500);
    }
  },

  login: async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await prisma.users.findUnique({
        where: { email }
      });

      if (!user) {
        return errorResponse(res, "invalid email or password", null, 401);
      }

      // Check if user is active
      if (!user.is_active) {
        return errorResponse(res, "Account is deactivated", null, 403);
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(
        password,
        user.password_hash
      );

      if (!isPasswordValid) {
        return errorResponse(res, "invalid email or password", null, 401);
      }

      // Check if JWT_SECRET exists
      if (!process.env.JWT_SECRET) {
        console.error("JWT_SECRET is not defined in environment variables");
        return errorResponse(res, "Server configuration error", null, 500);
      }

      const payload = {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name
      };

      // Ensure JWT secret is defined
      const jwtSecret = process.env.JWT_SECRET!; // Non-null assertion (already checked above)

      // Generate JWT token
      // @ts-ignore - Type mismatch with jsonwebtoken v9.0.2 and @types/jsonwebtoken v9.0.10
      const token = jwt.sign(payload, jwtSecret, {
        expiresIn: process.env.JWT_EXPIRES_IN || "1h"
      });

      const { password_hash, ...userWithoutPassword } = user;

      return successResponse(res, "Login successful", {
        user: userWithoutPassword,
        token
      });
    } catch (error) {
      console.error("Login error:", error);
      return errorResponse(res, "Login failed", null, 500);
    }
  }
};
