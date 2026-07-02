# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Repository overview

This is a full-stack app with two independently runnable projects:
- Frontend (repo root): React Native + Expo app (`App.js`, `src/`)
- Backend (`backend/`): NestJS + TypeORM + PostgreSQL API (`backend/src/`)

The mobile app talks to the backend over REST using `src/api/client.js`.

## Common development commands

### Frontend (run from repository root)

```bash
npm install
npm start
```

Platform-specific dev entrypoints:

```bash
npm run dev:android
npm run dev:ios
npm run dev:web
```

Windows fallback dev command (clears cache, enables polling watchers):

```bash
npm run start:win
```

EAS builds/submission scripts defined in `package.json`:

```bash
npm run build:apk
npm run build:playstore
npm run build:appstore
npm run submit:playstore
npm run submit:appstore
```

### Backend (run from `backend/`)

Install and run:

```bash
npm install
npm run start:dev
```

Other runtime modes:

```bash
npm run start:debug
npm run build
npm run start:prod
```

Lint/format:

```bash
npm run lint
npm run format
```

Tests:

```bash
npm run test
npm run test:watch
npm run test:cov
npm run test:e2e
```

Run a single backend Jest test file:

```bash
npm run test -- src/path/to/file.spec.ts
```

Run a single e2e test file:

```bash
npm run test:e2e -- test/path/to/file.e2e-spec.ts
```

Migrations:

```bash
npm run migration:run
npm run migration:revert
npm run migration:generate -- --name=DescriptiveName
npm run migration:create -- --name=DescriptiveName
```

## Environment/configuration

Backend DB configuration lives in `backend/src/config/database.config.ts`.

Connection strategy:
- `DATABASE_URL` is used when present.
- Otherwise `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` are used.

SSL behavior:
- `DB_SSL=true` enables TLS.
- `DB_SSL_REJECT_UNAUTHORIZED=false` disables cert validation (used only for self-signed setups).

JWT settings are sourced from env (`JWT_SECRET`, `JWT_EXPIRES_IN`) and wired in `AuthModule`.

Frontend API base URL is selected in `src/api/client.js` via `APP_ENV` + Expo public env vars:
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_API_URL_STAGING`
- `EXPO_PUBLIC_API_URL_PRODUCTION`

## High-level architecture

### Frontend architecture (`App.js`, `src/`)

App composition in `App.js` is provider-first and drives app flow:
- `AuthProvider` manages session, token restore, re-auth state, biometric unlock, and offline password fallback.
- `WorkspaceProvider` manages workspace selection, workspace-scoped data access, and sync state.
- `CustomerSelectProvider` and `ThemeProvider` provide UI/session helpers.
- `RootNavigator` renders one of four exclusive screens by priority: `AuthStack` (no user) → `ReAuthStack` (`requiresReAuth` is true, e.g. app foregrounded from background) → `WorkspaceSetupScreen` (no workspaces) → `MainTabs`.

Navigation structure:
- `src/navigation/AuthStack.js`: login/register/reset/verify flow.
- `src/navigation/ReAuthStack.js`: lock-screen style re-auth flow.
- `src/navigation/MainTabs.js`: primary authenticated app areas.

Data/access pattern:
- Network calls go through `src/api/client.js` (shared fetch wrapper + token injection).
- Local-first/offline persistence uses Expo SQLite (`src/storage/sqlite.js`) and offline-store helpers (`src/storage/offlineStore.js`).
- `WorkspaceContext` provides a workspace-scoped repository abstraction (`repo`) so feature screens operate within the selected workspace.

Offline sync model:
- Local tables (`local_inventory`, `local_transactions`, `local_debts`, etc.) hold client state.
- `sync_outbox` tracks queued actions with retry/backoff metadata.
- ID mapping table (`id_mapping`) maps local IDs to server IDs.
- `syncCoordinatorWorker` in `WorkspaceContext` drains outbox actions, handles dependency ordering, and marks conflicts.

### Backend architecture (`backend/src/`)

Nest bootstrap:
- `main.ts` creates the app and configures CORS from `CORS_ORIGIN`.
- `app.module.ts` composes feature modules and TypeORM config.

Module organization is domain-oriented under `backend/src/modules`:
- `auth`: registration/login/JWT strategy/guards.
- `workspace`: workspace + invite management.
- `inventory`: inventory CRUD.
- `transactions`: transaction/debt workflows (+ receipt service).
- `billing`: subscription/payment flows.
- `customer`: customer CRUD.
- `notifications`: email/push abstractions used by other modules.

Persistence model:
- TypeORM entities are colocated with modules.
- Shared DB config and migration DataSource are in `config/database.config.ts`.
- SQL migrations are in `backend/src/database/migrations` and are configured to run automatically in non-production via `migrationsRun: true`.

Cross-module coupling to know:
- `WorkspaceModule` depends on `BillingModule` and `NotificationsModule`.
- `AuthModule` depends on `NotificationsModule`.
- `TransactionsModule` joins `Transaction`, `Workspace`, `User`, and `InventoryItem` repositories in one service boundary.

## Additional architectural notes

**Debts are not a separate backend domain.** There is no `DebtModule` or `/debts` API endpoint. Debts are stored as `Transaction` entities with `type: 'debt'` and accessed through the same `/workspaces/:id/transactions` endpoint. The frontend `local_debts` SQLite table and `sync_outbox` `create_debt`/`update_debt`/`delete_debt` action types all ultimately map to the transactions API.

**Dual sync mechanism (legacy + SQLite outbox).** `WorkspaceContext` contains two sync paths:
- Legacy: `pendingActions` array persisted in AsyncStorage, drained by `processPendingActions`.
- Current: structured `sync_outbox` SQLite table, drained by `syncCoordinatorWorker` with dependency ordering, exponential backoff (base 1.5s, max 60s), and conflict detection. New code should use the outbox path.

**Non-production schema auto-sync.** `database.config.ts` sets `synchronize: true` when `NODE_ENV !== 'production'`. In development and staging, TypeORM will auto-apply entity changes without running migrations. Migrations are still generated and run (`migrationsRun: true`), but schema drift can mask migration issues in non-production.

**`src/services/offlineStore.js` is a legacy re-export shim.** The canonical implementation is `src/storage/offlineStore.js`. `src/services/offlineStore.js` only re-exports a subset of cache helpers for backward import-path compatibility — do not add logic there.

**`ReceiptService`** lives inside `TransactionsModule` and handles PDF receipt generation (using pdfkit + AWS S3 via `aws-sdk`).

## RevenueCat subscription management

**Frontend RevenueCat integration** is in the `RevenueCatProvider` (`src/context/RevenueCatContext.js`), wrapping `App.js` between `ThemeProvider` and `WorkspaceProvider`. The SDK wrapper lives in `src/services/revenuecat.js`.

User identity sync:
- `RevenueCatUserBridge` (in `App.js`) calls `revenuecat.login(user.id)` when a user authenticates, and `logout()` when they sign out.
- The bridge sits inside `RevenueCatProvider` and uses `useAuth()` + `useRevenueCat()` hooks.

Product & entitlement mapping (`src/services/revenuecat.js`):
- `PRODUCT_IDS` — maps to store product identifiers (e.g. `bizrecord_pro_yearly`, `bizrecord_addon_workspace_monthly`).
- `PRODUCT_META` — maps each product ID to its metadata (entitlement, type, billingCycle, plan, addonType).
- `ENTITLEMENTS` — RevenueCat entitlement IDs (`bizrecord_pro`, `bizrecord_basic`, `bizrecord_addon_workspace`, etc.).
- Helpers: `getPlanProductId(plan, cycle)`, `getAddonProductId(addonType, cycle)`, `getProductMeta(productId)`.

Purchase flow:
- `useRevenueCat().purchasePackage(pkg)` → wraps `Purchases.purchasePackage`, updates customer info state.
- `useRevenueCat().restorePurchases()` → wraps `Purchases.restorePurchases`.
- `useRevenueCat().syncPurchases()` → wraps `Purchases.syncPurchases`.

Paywall UI is available in two forms:
1. Custom paywall: `src/screens/billing/PaywallScreen.js` — renders offerings from `useRevenueCat().offerings`.
2. Native paywall: `useRevenueCat().showPaywall()` or `showPaywallIfNeeded('bizrecord_pro')`.

Customer Center: `src/screens/billing/CustomerCenterScreen.js` renders `<RevenueCatCustomerCenter>` from `react-native-purchases-ui`. Navigation targets `'CustomerCenter'` route in `MainTabs`.

**Backend RevenueCat integration** is in `RevenueCatWebhookService` (`backend/src/modules/billing/revenuecat.service.ts`):
- Endpoint: `POST /billing/webhook/revenuecat`
- Handles events: `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `TRIAL_STARTED`, `TRIAL_CONVERSION`, `UNCANCELLATION`, `BILLING_ISSUE`, `NON_RENEWING_PURCHASE`.
- Updates `Subscription` and `Payment` records, sends push notifications and emails.
- Supports webhook auth via `REVENUECAT_WEBHOOK_SECRET` env var (shared secret or HMAC).

**New environment variables needed:**
- `REVENUECAT_WEBHOOK_SECRET` — RevenueCat webhook shared secret (for server-side verification).
- `REVENUECAT_WEBHOOK_AUTH_DISABLED` — set to `true` in dev to skip webhook auth.
- RevenueCat API key is hardcoded in `src/services/revenuecat.js` for the test key; in production, move to `EXPO_PUBLIC_REVENUECAT_API_KEY` env var.

**Migration from react-native-iap:**
- Old `src/services/googleBilling.js` and `billingConfig.js` remain but the new `SubscriptionScreen.js` no longer imports them — it uses `useRevenueCat()` instead.
- The backend still supports the `POST /billing/verify/google` and `POST /billing/webhook/google` endpoints for legacy Google Play purchases alongside the new `POST /billing/webhook/revenuecat` endpoint.
