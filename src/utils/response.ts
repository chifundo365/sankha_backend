import { Request, Response as Response, NextFunction } from 'express';
import { success } from 'zod';

export interface ApiResponse<T = any> {
    success: boolean;
    message: string;
    data?: any;
    errors?: any;
    statusCode?: number;
}


export const successResponse = <T> (
    res: Response,
    message: string,
    data?: T,
    statusCode = 200,
): Response<ApiResponse<T>> => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

export const errorResponse = (
    res: Response,
    message: string,
    errors?: any,
    statusCode=400
): Response<ApiResponse> => {
    return res.status(statusCode).json({
        success: false,
        message,
        errors
    });
};