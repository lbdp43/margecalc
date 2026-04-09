import { Router } from 'express';
import authRoutes from './auth.routes';
import productRoutes from './product.routes';
import categoryRoutes from './category.routes';
import userRoutes from './user.routes';
import scanRoutes from './scan.routes';
import servingRoutes from './serving.routes';
import containerRoutes from './container.routes';
import productServingRoutes from './productServing.routes';
import subscriptionRoutes from './subscription.routes';
import recipeRoutes from './recipe.routes';
import systemParamRoutes from './systemParam.routes';
import rateRoutes from './rate.routes';
import ticketRoutes from './ticket.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/products', productServingRoutes);
router.use('/categories', categoryRoutes);
router.use('/users', userRoutes);
router.use('/scan', scanRoutes);
router.use('/servings', servingRoutes);
router.use('/containers', containerRoutes);
router.use('/subscription', subscriptionRoutes);
router.use('/recipes', recipeRoutes);
router.use('/system-params', systemParamRoutes);
router.use('/rates', rateRoutes);
router.use('/tickets', ticketRoutes);

export default router;
