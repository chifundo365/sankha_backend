import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';
import { errorResponse } from '../utils/response';

const validateResource = (schema: ZodType) => {
    return (req: Request, res: Response, next: NextFunction) => {
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

        // Write transformed/defaulted values back so controllers receive parsed data
        const parsed = result.data as Record<string, any>;
        if (parsed.body) req.body = parsed.body;
        if (parsed.query) {
            // req.query is a getter in some Express versions, so mutate in-place
            const q = req.query;
            for (const key of Object.keys(q)) delete q[key];
            Object.assign(q, parsed.query);
        }
        if (parsed.params) Object.assign(req.params, parsed.params);

        next();
    };
}

export default validateResource;