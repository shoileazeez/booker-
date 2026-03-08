# Booker Backend - NestJS API

Complete backend API for the Booker inventory management application built with NestJS, TypeORM, and PostgreSQL.

## Project Structure

```
src/
├── config/              # Configuration files (database, jwt)
├── modules/
│   ├── auth/           # Authentication & user management
│   │   ├── dto/
│   │   ├── entities/
│   │   ├── guards/
│   │   ├── strategies/
│   │   └── auth.module.ts
│   ├── workspace/      # Workspace management
│   │   ├── dto/
│   │   ├── entities/
│   │   └── workspace.module.ts
│   ├── inventory/      # Inventory item management
│   │   ├── dto/
│   │   ├── entities/
│   │   └── inventory.module.ts
│   └── transactions/   # Sales, expenses, purchases
│       ├── dto/
│       ├── entities/
│       └── transactions.module.ts
└── main.ts            # Application entry point
```

## Installation

1. **Install dependencies:**
```bash
cd backend
npm install
```

2. **Set up environment variables:**
```bash
cp .env.example .env
```

3. **Configure database:**
Edit `.env` with your PostgreSQL credentials:
```
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_NAME=booker_db
```

## Running the Application

### Development Mode (with auto-reload)
```bash
npm run start:dev
```

### Production Mode
```bash
npm run build
npm run start:prod
```

### Debug Mode
```bash
npm run start:debug
```

## Database Setup

1. **Create PostgreSQL database:**
```sql
CREATE DATABASE booker_db;
```

2. **Run migrations (automatic):**
TypeORM synchronization is enabled in development mode. In production, use:
```bash
npm run typeorm migration:run
```

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `GET /auth/profile` - Get current user (JWT required)

### Workspaces
- `POST /workspaces` - Create workspace (JWT required)
- `GET /workspaces` - List user's workspaces (JWT required)
- `GET /workspaces/:id` - Get workspace details (JWT required)
- `PUT /workspaces/:id` - Update workspace (JWT required)
- `POST /workspaces/:id/users/:userId` - Add user to workspace (JWT required)
- `DELETE /workspaces/:id/users/:userId` - Remove user from workspace (JWT required)

### Inventory
- `POST /workspaces/:workspaceId/inventory` - Create inventory item (JWT required)
- `GET /workspaces/:workspaceId/inventory` - List items (JWT required)
- `GET /workspaces/:workspaceId/inventory/search?q=term` - Search items (JWT required)
- `GET /workspaces/:workspaceId/inventory/:id` - Get item details (JWT required)
- `PUT /workspaces/:workspaceId/inventory/:id` - Update item (JWT required)
- `DELETE /workspaces/:workspaceId/inventory/:id` - Delete item (JWT required)

### Transactions
- `POST /workspaces/:workspaceId/transactions` - Create transaction (JWT required)
- `GET /workspaces/:workspaceId/transactions` - List transactions (JWT required)
- `GET /workspaces/:workspaceId/transactions/summary?startDate=...&endDate=...` - Get summary (JWT required)
- `GET /workspaces/:workspaceId/transactions/:id` - Get transaction (JWT required)
- `PUT /workspaces/:workspaceId/transactions/:id/status` - Update transaction status (JWT required)

## Authentication Flow

1. **Register:**
```bash
POST /auth/register
{
  "email": "user@example.com",
  "password": "securepass123",
  "name": "John Doe",
  "phone": "+1234567890"
}
```

2. **Login:**
```bash
POST /auth/login
{
  "email": "user@example.com",
  "password": "securepass123"
}
```

Response includes JWT token:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user"
  }
}
```

3. **Use token for authenticated requests:**
```bash
Authorization: Bearer <access_token>
```

## Testing

### Run unit tests
```bash
npm run test
```

### Run with coverage
```bash
npm run test:cov
```

### Run e2e tests
```bash
npm run test:e2e
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | PostgreSQL host | localhost |
| `DB_PORT` | PostgreSQL port | 5432 |
| `DB_USERNAME` | Database user | postgres |
| `DB_PASSWORD` | Database password | password |
| `DB_NAME` | Database name | booker_db |
| `JWT_SECRET` | JWT signing key | your-secret-key |
| `JWT_EXPIRES_IN` | Token expiration | 24h |
| `NODE_ENV` | Environment | development |
| `PORT` | Server port | 3000 |
| `CORS_ORIGIN` | Allowed origins | http://localhost:8081 |

## Code Quality

### Linting
```bash
npm run lint
```

### Format Code
```bash
npm run format
```

## Common Issues

### Port Already in Use
```bash
# Change PORT in .env
PORT=3001
```

### Database Connection Error
1. Verify PostgreSQL is running
2. Check credentials in .env
3. Ensure database exists
4. Check firewall/network access

### JWT Token Invalid
- Token may be expired (24h default)
- Secret key may differ between requests
- Check Authorization header format: `Bearer <token>`

## Features Implemented

- ✅ User authentication with JWT
- ✅ Workspace management (create, switch, manage users)
- ✅ Inventory management (CRUD operations)
- ✅ Transaction tracking (sales, expenses, purchases)
- ✅ Search functionality
- ✅ Role-based access control
- ✅ Database persistence with TypeORM
- ✅ Input validation with class-validator
- ✅ Error handling

## Deployment

### Prerequisites
- Node.js 18+
- PostgreSQL 12+
- npm 8+

### Steps
1. Set production environment variables
2. Run `npm run build`
3. Run `npm run start:prod`
4. Ensure database migrations are applied

## Security Best Practices

- Change `JWT_SECRET` in production
- Use strong database passwords
- Enable HTTPS in production
- Implement rate limiting
- Validate all inputs
- Use environment variables for secrets

## Support

For issues or questions, contact the development team or open an issue in the repository.
