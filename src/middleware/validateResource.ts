import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';
import { errorResponse } from '../utils/response';

const validateResource = (schema: ZodType) => {
    return (req: Request, res: Response, next: NextFunction) => {
        // Handle missing body gracefully
        const data = {
            body: req.body || {},
            query: req.query || {},
            params: req.params || {}
        };

        const result = schema.safeParse(data);

        if (!result.success) {
            const formattedErrors = result.error.issues.map((issue) => {
                // Remove 'body.', 'query.', 'params.' prefix from field names
                const fieldPath = issue.path.filter(p => p !== 'body' && p !== 'query' && p !== 'params').join('.');
                
                return {
                    field: fieldPath || 'unknown',
                    message: issue.message
                };
            });

            return errorResponse(res, 'Validation failed', formattedErrors, 400);
        }

        next();
    };
}

export default validateResource;