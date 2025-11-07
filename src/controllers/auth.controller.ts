import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../prismaClient';
import { z } from 'zod';

// Validation schema
const registerSchema = z.object({
  full_name: z.string().min(2).max(150),
  email: z.string().email().max(255),
  phone_number: z.string().min(10).max(20).optional(),
  password: z.string().min(6),
  role: z.enum(['USER', 'SELLER', 'ADMIN', 'SUPER_ADMIN']).optional().default('USER')
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export const authController = {
  register: async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validatedData = registerSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await prisma.users.findUnique({
        where: { email: validatedData.email }
      });

      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      // Hash password
      const password_hash = await bcrypt.hash(validatedData.password, 10);

      // Create user
      const user = await prisma.users.create({
        data: {
          full_name: validatedData.full_name,
          email: validatedData.email,
          phone_number: validatedData.phone_number,
          password_hash,
          role: validatedData.role
        },
        select: {
          id: true,
          full_name: true,
          email: true,
          phone_number: true,
          role: true,
          profile_image: true,
          is_active: true,
          created_at: true
          // Don't return password_hash
        }
      });

      res.status(201).json({ 
        message: 'User registered successfully',
        user 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: error.errors 
        });
      }
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  },

  login: async (req: Request, res: Response) => {
    try {
      // Validate request body
      const { email, password } = loginSchema.parse(req.body);

      // Find user by email
      const user = await prisma.users.findUnique({
        where: { email }
      });

      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Check if user is active
      if (!user.is_active) {
        return res.status(403).json({ error: 'Account is deactivated' });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);

      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // TODO: Generate JWT token here
      // For now, return user data without password
      const { password_hash, ...userWithoutPassword } = user;

      res.status(200).json({ 
        message: 'Login successful',
        user: userWithoutPassword
        // TODO: Add token: 'jwt-token-here'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: error.errors 
        });
      }
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
};