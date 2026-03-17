import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';
import { User } from '../modules/auth/entities/user.entity';
import { Workspace } from '../modules/workspace/entities/workspace.entity';
import { InventoryItem } from '../modules/inventory/entities/inventory-item.entity';
import { Transaction } from '../modules/transactions/entities/transaction.entity';

// SSL helpers – evaluated at module load for the CLI DataSource and on each
// databaseConfig() call for the runtime connection.
// DB_SSL=true       → enable SSL (most managed cloud databases require this)
// DB_SSL_REJECT_UNAUTHORIZED=false → allow self-signed certificates (only use
//   when your provider cannot supply a trusted CA bundle; this disables
//   certificate validation and should not be used in production unless the risk
//   is explicitly accepted).
function buildSslOption() {
  if (process.env.DB_SSL !== 'true') return false;
  const rejectUnauthorized =
    process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
  return { rejectUnauthorized };
}

export const databaseConfig = (): TypeOrmModuleOptions => {
  const ssl = buildSslOption();
  const shared = {
    type: 'postgres' as const,
    entities: [User, Workspace, InventoryItem, Transaction],
    synchronize: process.env.NODE_ENV !== 'production',
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    migrationsRun: true,
    logging: process.env.NODE_ENV === 'development',
    ssl,
  };

  if (process.env.DATABASE_URL) {
    return { ...shared, url: process.env.DATABASE_URL };
  }

  return {
    ...shared,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'booker_db',
  };
};

// DataSource for TypeORM CLI migrations.
// Environment variables are read once when this module is loaded (standard
// Node.js/NestJS behaviour – env vars do not change at runtime).
const entities = [User, Workspace, InventoryItem, Transaction];
const migrations = [__dirname + '/../database/migrations/*{.ts,.js}'];
const ssl = buildSslOption();

const dataSourceOptions: DataSourceOptions = process.env.DATABASE_URL
  ? {
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities,
      migrations,
      synchronize: false,
      ssl,
    }
  : {
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'booker_db',
      entities,
      migrations,
      synchronize: false,
      ssl,
    };

export default new DataSource(dataSourceOptions);

export const jwtConfig = () => ({
  secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  expiresIn: process.env.JWT_EXPIRES_IN || '24h',
});
