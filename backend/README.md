# BizRecord – Backend API

A RESTful API built with **NestJS**, **TypeScript**, and **PostgreSQL** that powers the BizRecord bookkeeping and inventory management app.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Database Configuration](#database-configuration)
- [Running the Server](#running-the-server)
- [API Endpoints](#api-endpoints)
- [Running Tests](#running-tests)
- [Database Migrations](#database-migrations)
- [Environment Variables Reference](#environment-variables-reference)

---

## Prerequisites

- Node.js v18+
- npm v8+
- PostgreSQL v12+

---

## Installation

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your settings
```

---

## Database Configuration

The backend supports **two ways** to provide database connection details.

### Option 1 – Connection URL (recommended for cloud deployments)

Set the `DATABASE_URL` environment variable to a full PostgreSQL connection string:

```env
DATABASE_URL=postgresql://user:password@host:5432/booker_db
```

This is the format used by most managed database services (Heroku, Railway, Render, Supabase, etc.). When `DATABASE_URL` is present it takes priority over the individual parameters below.

### Option 2 – Individual parameters

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=yourpassword
DB_NAME=booker_db
```

Both options are shown in [.env.example](.env.example).

### SSL / TLS

Many managed cloud databases (Railway, Render, Supabase, Heroku, etc.) require encrypted connections. If you see a **`SSL/TLS required`** error, add the following to your `.env`:

```env
DB_SSL=true
```

This works for both the `DATABASE_URL` and individual-parameter connection methods. By default, certificate validation is **enabled** (`rejectUnauthorized: true`), which is the secure setting and works with most managed databases that have CA-signed certificates.

If your provider uses **self-signed certificates** and you see a certificate validation error, you can additionally set:

```env
DB_SSL_REJECT_UNAUTHORIZED=false
```

> **Security note:** `DB_SSL_REJECT_UNAUTHORIZED=false` disables certificate chain validation and makes the connection susceptible to man-in-the-middle attacks. Only use it when your provider cannot supply a trusted CA bundle and you have accepted this risk.

---

## Running the Server

```bash
# Development (auto-reload)
npm run start:dev

# Debug mode
npm run start:debug

# Production (build first)
npm run build
npm run start:prod
```

The API listens on `http://localhost:3000` by default (configure with `PORT`).

---

## API Endpoints

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register a new user |
| POST | `/auth/login` | Log in and receive a JWT |

### Workspaces

| Method | Path | Description |
|--------|------|-------------|
| GET | `/workspaces` | List all workspaces for the logged-in user |
| POST | `/workspaces` | Create a workspace |
| GET | `/workspaces/:id` | Get a workspace |
| PATCH | `/workspaces/:id` | Update a workspace |
| DELETE | `/workspaces/:id` | Delete a workspace |

### Inventory

| Method | Path | Description |
|--------|------|-------------|
| GET | `/inventory` | List inventory items |
| POST | `/inventory` | Create an inventory item |
| GET | `/inventory/:id` | Get an item |
| PATCH | `/inventory/:id` | Update an item |
| DELETE | `/inventory/:id` | Delete an item |

### Transactions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/transactions` | List transactions |
| POST | `/transactions` | Record a transaction |
| GET | `/transactions/:id` | Get a transaction |
| PATCH | `/transactions/:id` | Update a transaction |
| DELETE | `/transactions/:id` | Delete a transaction |

All protected routes require the `Authorization: Bearer <token>` header.

---

## Running Tests

```bash
# Unit tests
npm run test

# Unit tests in watch mode
npm run test:watch

# Coverage report
npm run test:cov

# End-to-end tests
npm run test:e2e
```

---

## Database Migrations

```bash
# Run pending migrations
npm run migration:run

# Revert the last migration
npm run migration:revert

# Generate a migration from entity changes
npm run migration:generate -- --name=DescriptiveName

# Create a blank migration
npm run migration:create -- --name=DescriptiveName
```

Migrations run automatically on application startup in non-production environments.

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No* | – | Full PostgreSQL connection URL. Takes priority over individual DB_* vars. |
| `DB_HOST` | No* | `localhost` | Database host |
| `DB_PORT` | No* | `5432` | Database port |
| `DB_USERNAME` | No* | `postgres` | Database user |
| `DB_PASSWORD` | No* | `password` | Database password |
| `DB_NAME` | No* | `booker_db` | Database name |
| `DB_SSL` | No* | `false` | Set to `true` to enable SSL/TLS (required by most managed cloud databases) |
| `DB_SSL_REJECT_UNAUTHORIZED` | No | `true` | Set to `false` to allow self-signed certificates (disables cert validation – use with caution) |
| `JWT_SECRET` | **Yes** | – | Secret key for signing JWT tokens |
| `JWT_EXPIRES_IN` | No | `24h` | JWT expiry duration |
| `PORT` | No | `3000` | Port the server listens on |
| `NODE_ENV` | No | `development` | `development` \| `production` |
| `CORS_ORIGIN` | No | `*` | Comma-separated list of allowed CORS origins |

\* Either `DATABASE_URL` **or** all of `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_NAME` must be provided.

