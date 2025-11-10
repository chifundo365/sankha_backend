import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';
import { errorResponse } from '../utils/response';

const validateResource = (schema: ZodType) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse({
            body: req.body,
            query: req.query,
            params: req.params
        });

        if (!result.success) {
            const formatedErrors = result.error.issues.map((issue) => ({
                path: issue.path.join('.'),
                message: issue.message
            }));

            return errorResponse(res, 'Validation Failed', formatedErrors, 400);
        }

        next();
    };
}

export default validateResource;