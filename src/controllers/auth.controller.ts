import { Request, Response } from 'express';
import  bcrypt from 'bcrypt';
import prisma from '../prismaClient';
import { errorResponse, successResponse } from '../utils/response';
import jwt from 'jsonwebtoken';


export const authController = {
  register: async (req: Request, res: Response) => {
    try {

    } catch (error) {
      console.log(error);
    }
  },

  login: async (req: Request, res: Response) => {
    try {

      const { email, password } = req.body

      // Find user by email
      const user = await prisma.users.findUnique({
        where: { email }
      });

      if (!user) {
        return errorResponse(res, 'invalid email or password', null, 401);
      }

      // Check if user is active
      if (!user.is_active) {
        return errorResponse(res, 'Account is deactivated', null, 403);
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);

      if (!isPasswordValid) {
        return errorResponse(res, 'invalid email or password', null, 401);
      }
      
      // TODO: Generate JWT token here
      const token = jwt.sign(user, process.env.JWT_SECRET as string, { expiresIn: '1h' }, (err: any, token: string | undefined) => {
        if (err) {
          console.error('JWT error:', err);
          return errorResponse(res, 'Login failed', null, 500);
        }
      });

      const { password_hash, ...userWithoutPassword } = user;

      return successResponse(res, 'Login successful', { user: userWithoutPassword, token });  
    } catch (error) {
      console.error('Login error:', error);
      return errorResponse(res, 'Login failed', null, 500);
    }
  }
};