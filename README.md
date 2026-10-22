# MargeBar Pro

> **Le calculateur de marges fait pour vous, sans prise de tête.**
> Application mobile et web pour piloter la rentabilité de chaque boisson —
> du shot de spiritueux à la pinte de bière, en passant par les droits d'accise.

[![Version](https://img.shields.io/badge/version-3.14-1B7A55)](https://github.com/lbdp43/margecalc)
[![Stack](https://img.shields.io/badge/stack-Expo%20%7C%20React%20Native%20%7C%20Node.js%20%7C%20Postgres-1B7A55)](#stack-technique)
[![Production](https://img.shields.io/badge/production-margecalc--production.up.railway.app-0E4D34)](https://margecalc-production.up.railway.app/Landing)

Application créée par **[La Brasserie des Plantes](https://labrasseriedesplantes.fr/)** — artisans-producteurs de spiritueux à Saint-Didier-en-Velay (Haute-Loire).

---

## Démo

→ **[https://margecalc-production.up.railway.app/Landing](https://margecalc-production.up.railway.app/Landing)**

L'application est **gratuite pour tous** : pas d'abonnement, pas de carte bancaire, pas de code promo. Une inscription (e-mail + mot de passe) suffit pour accéder au tableau de bord, aux fiches produits, au scan et au calculateur.

---

## Fonctionnalités

### Pour les pros du comptoir

- **Calcul des droits d'alcool** — prix HT avec et sans droits d'accise pour les 13 catégories fiscales françaises (vins tranquilles & mousseux, cidres, porto/VDN, bières légères/standard/artisanales, spiritueux, rhum DOM/hors DOM, liqueurs, vermouths). Tarifs 2026 à jour.
- **Prix de revient précis** — droits d'accise + cotisation sécurité sociale + TVA intégrés en un seul calcul.
- **Calcul de marges** sur 3 modes : prix de vente fixe, marge cible, ou coefficient — par shot, verre, demi, pinte ou bouteille.
- **Scan par lecture automatique (OCR)**, gratuit et sans service externe — [détails](#scan-ocr) :
  - **Bouteille** — photo de l'étiquette → nom, marque, contenance, degré, catégorie pré-remplis (la fiche reste modifiable).
  - **Facture fournisseur** — photo → lignes produits (désignation, contenance, prix d'achat HT unitaire, quantité), importées en une fois.
- **Photo produit** sur chaque fiche (enregistrée avec la fiche, supprimable à tout moment).
- **Tableau de bord** avec marge par catégorie, top/flop rentabilité, fiches produit complètes par service.
- **Recettes cocktails** avec calcul de marge sur la composition complète.
- **Mode hors-ligne** avec synchronisation automatique au retour de connexion.

### Pour l'admin

- Vue d'ensemble de tous les utilisateurs avec MRR/ARR.
- **Suivi des connexions** : compteurs mensuels par utilisateur + agrégat global, avec filtre période (Ce mois / Trimestre / Année / 2 ans) et graphique en barres mensuelles.
- Vue **Tous les produits** — tableau filtré par utilisateur.
- Bannir / débannir un compte (les données restent conservées, l'accès est bloqué).
- Suppression définitive d'un compte (transactionnelle, cascade complète).
- Gestion des tarifs d'accise / cotisations / TVA paramétrables.
- Gestion des tickets utilisateurs (bug, suggestions, questions).

---

## Stack technique

| Couche             | Technologies                                                   |
|--------------------|---------------------------------------------------------------|
| Mobile / Web       | Expo 50, React Native 0.73, TypeScript, react-native-svg       |
| Navigation         | React Navigation v6 (bottom tabs + native stack)               |
| State              | Zustand (auth, system params, rates) + TanStack React Query    |
| Backend            | Node.js 22, Express, TypeScript, Zod                           |
| Base de données    | PostgreSQL + Prisma 5                                          |
| Auth               | JWT (access 1h + refresh 30j), bcrypt                          |
| Paiement           | Stripe (Checkout + Customer Portal + webhooks) — dormant       |
| Scan (OCR)         | Tesseract.js 5 sur le serveur (fra + eng), sans clé d'API      |
| Déploiement        | Railway (railpack auto-detect)                                 |

### Direction esthétique

L'interface adopte une esthétique **« Atelier »** — papier kraft crème (`#E8EFDD`), accent vert émeraude (`#1B7A55`), typographie italique sérif pour les chiffres et titres, accents manuscrits cursifs sur les éléments décoratifs. Inspirée du carnet de bistrot, conçue pour rester lisible et chaleureuse.

---

## Structure du monorepo

```
margebar/
├── shared/    # Types, constantes (PALETTE, DEFAULT_MARGIN_THRESHOLDS), utils (calculateMargin, calculateServingMargin)
├── backend/   # API Express + Prisma + routes (auth, products, recipes, scan, admin, subscription, tickets)
├── mobile/    # Application Expo (iOS, Android, Web)
│   └── src/
│       ├── components/ui/atelier.tsx  # Display, Eyebrow, Script, Num, InkStamp, Scribble, HangTag
│       ├── theme/index.ts             # Palette + tokens atelier
│       ├── navigation/                # Auth + App navigators (titres FR pour l'onglet web)
│       ├── screens/                   # dashboard, products, cocktails, scan, settings, auth, subscription
│       └── services/                  # API clients (axios)
└── scripts/   # generate-icons.py (logo M atelier), patch-html.js (PWA meta)
```

Le monorepo utilise les **npm workspaces**.

---

## Installation

### Prérequis

- Node.js 22+
- PostgreSQL 14+
- (optionnel) Compte Stripe pour les abonnements

### 1. Cloner et installer

```bash
git clone https://github.com/lbdp43/margecalc.git
cd margecalc
npm install
```

### 2. Configurer l'environnement

```bash
cp backend/.env.example backend/.env
```

Variables requises :

| Variable       | Description                                       |
|----------------|---------------------------------------------------|
| `DATABASE_URL` | URL PostgreSQL (`postgres://user:pass@host/db`)   |
| `JWT_SECRET`   | Clé secrète JWT (32+ caractères en production)    |
| `PORT`         | Port HTTP (défaut : 3000)                         |

Variables optionnelles :

| Variable                | Description                                          |
|-------------------------|------------------------------------------------------|
| `SCAN_DAILY_LIMIT`      | Scans réussis par compte et par jour (défaut : 50)   |
| `TESSDATA_DIR`          | Dossier des données de langue OCR (défaut : `<tmp>/margebar-tessdata`) |
| `OCR_LANGS`             | Langues OCR (défaut : `fra+eng`)                     |
| `OCR_BOTTLE_TIMEOUT_MS` | Budget d'un scan bouteille (défaut : 15000)          |
| `OCR_INVOICE_TIMEOUT_MS`| Budget d'un scan facture (défaut : 60000)            |
| `OCR_INIT_TIMEOUT_MS`   | Démarrage du moteur OCR (défaut : 30000)             |
| `OCR_IDLE_MS`           | Arrêt du moteur après inactivité (défaut : 600000)   |
| `OCR_MAX_QUEUE`         | Scans en file d'attente au maximum (défaut : 6)      |
| `OCR_MAX_SIDE_BOTTLE`   | Plus grand côté d'une photo de bouteille, en px (défaut : 2400) |
| `OCR_MAX_SIDE_INVOICE`  | Plus grand côté d'une photo de facture, en px (défaut : 3500)   |
| `REGISTER_LIMIT_PER_HOUR` | Créations de compte par IP et par heure (défaut : 10 en production) |
| `STRIPE_SECRET_KEY`     | Clé secrète Stripe (paiement dormant, l'app est gratuite) |
| `STRIPE_WEBHOOK_SECRET` | Secret webhooks Stripe                               |
| `STRIPE_PRICE_MONTHLY`  | ID du prix Stripe mensuel (3 €)                      |
| `STRIPE_PRICE_YEARLY`   | ID du prix Stripe annuel (30 €)                      |
| `ALLOWED_ORIGINS`       | Origines CORS séparées par virgules                  |
| `APP_URL`               | URL publique de l'app (pour les redirects Stripe)    |

### 3. Initialiser la base de données

```bash
npm run db:push
```

ou pour appliquer les migrations Prisma versionnées :

```bash
cd backend && npx prisma migrate deploy && cd ..
```

### 4. Lancer en développement

Trois processus en parallèle :

```bash
# Terminal 1 — shared (mode watch, pour propager les changements de types)
cd shared && npm run watch

# Terminal 2 — backend
cd backend && npm run dev

# Terminal 3 — mobile / web
cd mobile && npm start
```

---

## Build production

```bash
npm run build
```

Cette commande :

1. Compile `@margebar/shared` (TypeScript → `dist/`)
2. Génère le client Prisma
3. Compile le backend
4. Exporte l'app Expo en bundle web → `backend/dist/public`
5. Patche le HTML pour le support PWA (viewport, apple-touch-icon, theme-color émeraude)

Tests unitaires des extracteurs du scan (sans image ni moteur OCR, ~1 s) :

```bash
npm test --workspace=backend
```

Pour démarrer en production :

```bash
npm start
```

Cela exécute les migrations Prisma, le seed initial (catégories + types de service par défaut), puis démarre le serveur Express qui sert l'API + le bundle web statique.

---

## Déploiement

Le projet inclut une configuration `railway.json` pour [Railway](https://railway.app). Au push :

1. Railway détecte le monorepo Node 22 (`railpack`)
2. `npm ci` installe les workspaces
3. `npm run build` compile tout
4. La commande de démarrage exécute les migrations + seed + serveur

Le déploiement actuel est accessible à [margecalc-production.up.railway.app](https://margecalc-production.up.railway.app/Landing).

---

## API

Toutes les routes (sauf `/api/auth/*` et `/health`) requièrent un header `Authorization: Bearer <token>`. Le rôle et le bannissement sont relus en base (cache de 60 s, sans cache pour les routes admin) : un compte banni est déconnecté sans attendre l'expiration de son jeton.

Les erreurs ont toujours la forme `{ error: '<phrase en français>', details?: [{ field, label, message, code }], code?, retryable? }` ; une erreur de validation (400) inclut toujours `details`.

### Auth

| Méthode | Endpoint                | Description                                  |
|---------|-------------------------|----------------------------------------------|
| POST    | `/api/auth/register`    | Créer un compte                              |
| POST    | `/api/auth/login`       | Connexion (refuse 403 si compte banni)       |
| POST    | `/api/auth/refresh`     | Renouveler l'access token                    |

### Données utilisateur

| Méthode    | Endpoint                          | Description                                   |
|------------|-----------------------------------|-----------------------------------------------|
| GET / POST / PUT / DELETE | `/api/products`       | CRUD produits (photo en data URI, services inclus) |
| GET / POST / PATCH / DELETE | `/api/recipes`      | CRUD recettes cocktails                       |
| POST       | `/api/scan/product` · `/api/scan/invoice` | Scan OCR d'une bouteille / d'une facture ([détails](#scan-ocr)) |
| GET        | `/api/scan/quota`                 | Scans réussis du jour (`limit`, `used`, `remaining`) |
| POST       | `/api/products/import`            | Import des lignes d'une facture (erreurs ligne par ligne) |
| GET / POST | `/api/categories`                 | Catégories intégrées + catégories personnelles du compte (un admin crée des catégories pour tous) |
| GET / POST | `/api/servings`                   | Types de service personnalisés                |
| GET / POST | `/api/containers`                 | Contenants personnalisés                      |
| GET        | `/api/rates`                      | Tarifs d'accise / cotisations / TVA           |
| GET / PATCH| `/api/system-params`              | Paramètres système (lien réf., TVA non-alc.)  |
| POST       | `/api/subscription`               | Stripe Checkout / Portal / redeem code        |
| POST / GET | `/api/tickets`                    | Bug reports / suggestions / questions         |

### Scan OCR

La lecture des photos se fait **sur le serveur avec [Tesseract.js](https://tesseract.projectnaptha.com/)** (moteur OCR libre, langues français + anglais) : aucune clé d'API, aucun service externe, aucun coût par scan. Les données de langue viennent des paquets npm `@tesseract.js-data/fra` et `@tesseract.js-data/eng` (copiées une fois dans `TESSDATA_DIR`, sans accès réseau).

- `POST /api/scan/product` `{ imageBase64 }` → `{ name, brand, category, containerVolumeCl, alcoholDegree, estimatedPriceHT, confidence, raw }`.
- `POST /api/scan/invoice` `{ imageBase64 }` → `{ supplier, invoiceDate, products: [...], raw }` ; l'import se fait ensuite via `POST /api/products/import`.
- Extraction heuristique : plus grandes lignes de texte pour le nom, correction des marques connues mal lues (sans jamais réécrire un mot courant : « Pomme » reste « Pomme »), contenance (cl / ml / L), degré (% vol, °), catégorie par mots-clés.
- Échec de lecture → **422** `{ error: 'Lecture impossible…', code, retryable }` (`empty`, `bad_image`, `busy`, `timeout`, `engine`). L'application passe alors à la fiche à remplir en gardant la photo.
- Seuls les scans **réussis** comptent dans le quota quotidien (`SCAN_DAILY_LIMIT`, 50 par défaut). Limites d'équité : 10 scans par minute, un scan à la fois par compte, pause de quelques minutes après 3 photos illisibles d'affilée.
- L'application réduit la photo à 1 600 px avant l'envoi ; le serveur refuse les images de plus de 2 400 px (bouteille) / 3 500 px (facture) de côté.

### Photos produit

Les photos ne sont pas envoyées à un service tiers : elles sont stockées **dans la base, sur la fiche produit**, sous forme de petites images JPEG en data URI (`data:image/jpeg;base64,…`) :

- `imageUrl` — photo ~640 px (300 000 caractères maximum), renvoyée par `GET /api/products/:id` ;
- `thumbnailUrl` — miniature ~160 px (40 000 caractères maximum), renvoyée aussi par la liste `GET /api/products`.

Sur `PUT /api/products/:id`, un champ absent ne change rien et `null` supprime la photo. Corps JSON limité à 2 Mo (413 « Photo trop volumineuse » au-delà).

### Admin (`role: 'admin'` requis)

| Méthode | Endpoint                                  | Description                                          |
|---------|-------------------------------------------|------------------------------------------------------|
| GET     | `/api/admin/users`                        | Liste des utilisateurs + stats + revenu MRR/ARR      |
| GET     | `/api/admin/users/:userId/products`       | Produits d'un utilisateur avec marges                |
| GET     | `/api/admin/products`                     | Tous les produits de tous les utilisateurs           |
| PATCH   | `/api/admin/users/:userId/ban`            | Bannir un compte                                     |
| PATCH   | `/api/admin/users/:userId/unban`          | Débannir un compte                                   |
| DELETE  | `/api/admin/users/:userId`                | Supprimer définitivement (cascade)                   |
| GET     | `/api/admin/logins`                       | Connexions agrégées tous utilisateurs (série + total)|
| GET     | `/api/admin/users/:userId/logins`         | Série mensuelle des connexions d'un utilisateur      |

---

## Contact

**La Brasserie des Plantes** — L'art des assemblages de plantes
Saint-Didier-en-Velay, Haute-Loire

- ✉️ labrasseriedesplantes@gmail.com
- 🌐 [labrasseriedesplantes.fr](https://labrasseriedesplantes.fr/)

---

## Licence

Projet privé. Application gratuite pour les professionnels CHR.
