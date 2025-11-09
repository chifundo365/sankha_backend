import { Request, Response, NextFunction } from 'express';
import { ZodObject } from 'zod';

const validateResource = (schema: ZodObject) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse({
            body: req.body,
            query: req.query,
            params: req.params
        });

        if (!result.success) {
            return res.status(400).json({
                error: "Validation failed",
                details: result.error.errors
            });
        }

        next();
    };
}

export default validateResource;