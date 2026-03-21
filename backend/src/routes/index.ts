import { Router } from 'express';
import authRoutes from './auth.routes';
import productRoutes from './product.routes';
import categoryRoutes from './category.routes';
import userRoutes from './user.routes';
import scanRoutes from './scan.routes';
import servingRoutes from './serving.routes';
import productServingRoutes from './productServing.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/products', productServingRoutes);
router.use('/categories', categoryRoutes);
router.use('/users', userRoutes);
router.use('/scan', scanRoutes);
router.use('/servings', servingRoutes);

export default router;
