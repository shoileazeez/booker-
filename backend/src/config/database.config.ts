import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from '../modules/auth/entities/user.entity';
import { Workspace } from '../modules/workspace/entities/workspace.entity';
import { InventoryItem } from '../modules/inventory/entities/inventory-item.entity';
import { Transaction } from '../modules/transactions/entities/transaction.entity';

export const databaseConfig = (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'booker_db',
  entities: [User, Workspace, InventoryItem, Transaction],
  synchronize: process.env.NODE_ENV !== 'production',
  migrations: ['dist/database/migrations/*.js'],
  migrationsRun: true,
  logging: process.env.NODE_ENV === 'development',
});

export const jwtConfig = () => ({
  secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  expiresIn: process.env.JWT_EXPIRES_IN || '24h',
});
