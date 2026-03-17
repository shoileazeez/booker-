# BizRecord

A full-stack bookkeeping and inventory management application for small businesses, built with **React Native (Expo)** for the frontend and **NestJS + PostgreSQL** for the backend.

---

## Repository Structure

```
BizRecord/
├── backend/          # NestJS REST API (Node.js + TypeScript + PostgreSQL)
├── src/              # React Native frontend screens and components
├── assets/           # Frontend image and icon assets
├── App.js            # Frontend entry point
└── package.json      # Frontend dependencies
```

---

## Frontend (React Native / Expo)

### Prerequisites

- Node.js v18+
- Expo CLI (`npm install -g expo-cli`)

### Quick Start

```bash
# Install frontend dependencies
npm install

# Start the Expo development server
npm start
```

Open the Expo Go app on your phone and scan the QR code, or press `a` for Android emulator / `i` for iOS simulator.

---

## Backend (NestJS API)

See **[backend/README.md](./backend/README.md)** for full setup instructions.

### Quick Start

```bash
cd backend
npm install
cp .env.example .env   # fill in your database credentials
npm run start:dev
```

The API will be available at `http://localhost:3000`.

---

## Environment Variables

The backend supports two ways to configure the database connection:

| Method | Variable | Example |
|--------|----------|---------|
| Connection URL | `DATABASE_URL` | `postgresql://user:pass@host:5432/booker_db` |
| Individual params | `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` | see `backend/.env.example` |

`DATABASE_URL` takes priority when both are provided.

Set `DB_SSL=true` when your database server requires SSL/TLS (common with managed cloud databases such as Railway, Render, Supabase, and Heroku). This applies to both connection methods.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile frontend | React Native, Expo |
| Backend API | NestJS, TypeScript |
| Database | PostgreSQL, TypeORM |
| Authentication | JWT, Passport, bcrypt |
| Validation | class-validator, Joi |

---

## License

MIT

