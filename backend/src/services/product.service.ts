import { prisma } from '../config/database';
import { calculateMargin, MarginMode, ProductWithMargin, CreateProductInput } from '@margebar/shared';

function enrichProduct(product: any): ProductWithMargin {
  const computed = calculateMargin({
    purchasePriceHT: product.purchasePriceHT,
    containerVolumeCl: product.containerVolumeCl,
    doseVolumeCl: product.doseVolumeCl,
    marginMode: product.marginMode as MarginMode,
    sellingPriceTTC: product.sellingPriceTTC ?? undefined,
    targetMarginPercent: product.targetMarginPercent ?? undefined,
    coefficient: product.coefficient ?? undefined,
    tvaRate: product.tvaRate,
  });

  return { ...product, computed };
}

export async function getProducts(userId: string, categoryId?: string) {
  const where: any = { userId };
  if (categoryId) where.categoryId = categoryId;

  const products = await prisma.product.findMany({
    where,
    include: { category: true },
    orderBy: { updatedAt: 'desc' },
  });

  return products.map(enrichProduct);
}

export async function getProduct(id: string, userId: string) {
  const product = await prisma.product.findFirst({
    where: { id, userId },
    include: { category: true },
  });
  if (!product) throw new Error('Produit non trouvé');
  return enrichProduct(product);
}

export async function createProduct(userId: string, data: CreateProductInput) {
  const product = await prisma.product.create({
    data: {
      userId,
      categoryId: data.categoryId,
      name: data.name,
      purchasePriceHT: data.purchasePriceHT,
      containerVolumeCl: data.containerVolumeCl,
      doseVolumeCl: data.doseVolumeCl,
      marginMode: data.marginMode,
      sellingPriceTTC: data.sellingPriceTTC ?? null,
      targetMarginPercent: data.targetMarginPercent ?? null,
      coefficient: data.coefficient ?? null,
      tvaRate: data.tvaRate,
      supplier: data.supplier ?? null,
    },
    include: { category: true },
  });

  return enrichProduct(product);
}

export async function updateProduct(id: string, userId: string, data: Partial<CreateProductInput>) {
  const existing = await prisma.product.findFirst({ where: { id, userId } });
  if (!existing) throw new Error('Produit non trouvé');

  // Track price history
  if (data.purchasePriceHT !== undefined && data.purchasePriceHT !== existing.purchasePriceHT) {
    await prisma.priceHistory.create({
      data: {
        productId: id,
        oldPrice: existing.purchasePriceHT,
        newPrice: data.purchasePriceHT,
        source: 'manual',
      },
    });
  }

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...data,
      sellingPriceTTC: data.sellingPriceTTC ?? undefined,
      targetMarginPercent: data.targetMarginPercent ?? undefined,
      coefficient: data.coefficient ?? undefined,
      supplier: data.supplier ?? undefined,
    },
    include: { category: true },
  });

  return enrichProduct(product);
}

export async function deleteProduct(id: string, userId: string) {
  const existing = await prisma.product.findFirst({ where: { id, userId } });
  if (!existing) throw new Error('Produit non trouvé');
  await prisma.product.delete({ where: { id } });
}
