import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { userWriteLimiter } from '../middleware/userRateLimit';
import * as recipeService from '../services/recipe.service';

const router = Router();

const ingredientSchema = z.object({
  productId: z.string().uuid().optional(),
  name: z.string().min(1),
  quantityCl: z.number().positive(),
  costPerUnit: z.number().min(0),
});

const consumableSchema = z.object({
  name: z.string().min(1),
  unitCost: z.number().min(0),
  quantity: z.number().positive(),
});

const createSchema = z.object({
  name: z.string().min(1, 'Nom requis').max(200),
  description: z.string().max(2000).optional(),
  sellingPriceTTC: z.number().positive().optional(),
  tvaRate: z.number().min(0).max(1),
  imageUrl: z.string().url('URL image invalide').optional(),
  isPublic: z.boolean().optional(),
  ingredients: z.array(ingredientSchema).min(1, 'Au moins un ingrédient requis'),
  consumables: z.array(consumableSchema),
});

router.use(authenticate);

// Get user's recipes
router.get('/', async (req: Request, res: Response) => {
  try {
    const recipes = await recipeService.getRecipes(req.user!.userId);
    res.json(recipes);
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get public/community recipes
router.get('/community', async (_req: Request, res: Response) => {
  try {
    const recipes = await recipeService.getPublicRecipes();
    res.json(recipes);
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get single recipe
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const recipe = await recipeService.getRecipe(req.params.id, req.user!.userId);
    res.json(recipe);
  } catch (err: any) {
    const status = err.message === 'Recette non trouvée' ? 404 : 500;
    res.status(status).json({ error: err.message === 'Recette non trouvée' ? err.message : 'Erreur serveur' });
  }
});

// Create recipe
router.post('/', userWriteLimiter, async (req: Request, res: Response) => {
  try {
    const data = createSchema.parse(req.body);
    const recipe = await recipeService.createRecipe(req.user!.userId, data);
    res.status(201).json(recipe);
  } catch (err: any) {
    const status = err.name === 'ZodError' ? 400 : 500;
    res.status(status).json({ error: err.name === 'ZodError' ? err.message : 'Erreur serveur' });
  }
});

// Update recipe
router.put('/:id', userWriteLimiter, async (req: Request, res: Response) => {
  try {
    const data = createSchema.partial().parse(req.body);
    const recipe = await recipeService.updateRecipe(req.params.id, req.user!.userId, data);
    res.json(recipe);
  } catch (err: any) {
    const status = err.message === 'Recette non trouvée' ? 404 : err.name === 'ZodError' ? 400 : 500;
    res.status(status).json({ error: err.message === 'Recette non trouvée' ? err.message : 'Erreur serveur' });
  }
});

// Delete recipe
router.delete('/:id', userWriteLimiter, async (req: Request, res: Response) => {
  try {
    await recipeService.deleteRecipe(req.params.id, req.user!.userId);
    res.status(204).send();
  } catch (err: any) {
    const status = err.message === 'Recette non trouvée' ? 404 : 500;
    res.status(status).json({ error: err.message === 'Recette non trouvée' ? err.message : 'Erreur serveur' });
  }
});

export default router;
