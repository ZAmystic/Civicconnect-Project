import { Router } from "express";
import authenticationRoutes from "./users/auth_routes";
import managementRoutes from "./users/management_routes";
import profileRoutes from "./users/profile_routes";

const router = Router();

router.use(authenticationRoutes);
router.use(profileRoutes);
router.use(managementRoutes);

export default router;
