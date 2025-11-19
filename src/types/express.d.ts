import { user_role } from "../../generated/prisma";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: user_role;
        first_name: string;
        last_name: string;
      };
    }
  }
}
