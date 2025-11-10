import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import validateResource from "../middleware/validateResource";
import { loginSchema } from "../schemas/auth.schma";


const router = Router();

router.post('/register', authController.register);
router.post('/login', validateResource(loginSchema), authController.login);

export default router;