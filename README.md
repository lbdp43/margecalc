# MargeBar

Calculateur de marges pour bars et restaurants. Application mobile et web permettant de piloter la rentabilité de chaque boisson, du spiritueux au cocktail.

## Fonctionnalités

- **Calcul de marge** sur 3 modes : prix de vente fixe, marge cible, ou coefficient
- **Gestion des produits** avec catégories (Spiritueux, Vins, Bières, Softs, Ingrédients, Consommables), historique de prix et fournisseurs
- **Recettes cocktails** avec calcul de marge sur la composition complète
- **Scan de bouteilles** via Claude Vision — extraction automatique du nom, volume, catégorie et prix estimé
- **Scan de factures** — import multi-produits depuis une photo de facture
- **Dashboard** avec répartition par catégorie, top/flop marges
- **Taxes** : TVA multi-taux, droit d'accise et cotisation sécu sur l'alcool
- **Mode hors-ligne** avec synchronisation automatique
- **Abonnements** Stripe (gratuit / pro mensuel / pro annuel)

## Stack technique

| Couche | Technologies |
|--------|-------------|
| Mobile / Web | Expo 50, React Native 0.73, TypeScript |
| Navigation | React Navigation v6 |
| State | Zustand (auth) + TanStack React Query (serveur) |
| Backend | Node.js, Express, TypeScript |
| Base de données | PostgreSQL + Prisma 5 |
| Paiement | Stripe |
| IA / Scan | Anthropic Claude (Vision) |

## Structure du monorepo

```
margebar/
├── shared/    # Types, constantes et utilitaires partagés
├── backend/   # API Express + Prisma
├── mobile/    # Application Expo (iOS, Android, Web)
└── scripts/   # Utilitaires de build (patch HTML pour PWA)
```

Le monorepo utilise les **npm workspaces**.

## Installation

### Prérequis

- Node.js 18+
- PostgreSQL
- (Optionnel) Clé API Anthropic pour le scan
- (Optionnel) Compte Stripe pour les abonnements

### 1. Cloner et installer

```bash
git clone https://github.com/lbdp43/margecalc.git
cd margecalc
npm install
```

### 2. Configurer l'environnement

Copier le fichier d'exemple et renseigner les variables :

```bash
cp backend/.env.example backend/.env
```

Variables requises :

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | URL de connexion PostgreSQL |
| `JWT_SECRET` | Clé secrète JWT (32 caractères min en production) |
| `PORT` | Port du serveur (défaut : 3000) |

Variables optionnelles :

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Clé API Claude pour le scan de bouteilles/factures |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe |
| `STRIPE_WEBHOOK_SECRET` | Secret pour les webhooks Stripe |
| `STRIPE_PRICE_MONTHLY` | ID prix Stripe mensuel |
| `STRIPE_PRICE_YEARLY` | ID prix Stripe annuel |
| `ALLOWED_ORIGINS` | Origines CORS autorisées (séparées par des virgules) |
| `APP_URL` | URL publique de l'application |

### 3. Initialiser la base de données

```bash
npm run db:push
```

### 4. Lancer en développement

Backend :

```bash
cd backend
npm run dev
```

Mobile :

```bash
cd mobile
npm start
```

Shared (mode watch) :

```bash
cd shared
npm run watch
```

## Build production

```bash
npm run build
npm start
```

Cette commande compile shared → backend → exporte le web Expo → patche le HTML pour le support PWA, puis lance le serveur avec migration Prisma et seeding.

## Déploiement

Le projet inclut une configuration `railway.json` pour un déploiement sur [Railway](https://railway.app). Le déploiement exécute automatiquement les migrations Prisma et le seed avant de démarrer le serveur.

## API

Principales routes :

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/register` | Inscription |
| `POST /api/auth/login` | Connexion |
| `GET/POST /api/products` | CRUD produits |
| `GET/POST /api/recipes` | CRUD recettes cocktails |
| `POST /api/scan` | Scan d'image (bouteille ou facture) |
| `GET /api/categories` | Liste des catégories |
| `GET/POST /api/servings` | Types de service personnalisés |
| `GET/POST /api/containers` | Contenants personnalisés |
| `POST /api/subscription` | Gestion abonnement Stripe |

Toutes les routes (sauf auth) nécessitent un token JWT dans le header `Authorization: Bearer <token>`.

## Licence

Projet privé.
