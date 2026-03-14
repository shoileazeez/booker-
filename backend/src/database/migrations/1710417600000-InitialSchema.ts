import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1710417600000 implements MigrationInterface {
  name = 'InitialSchema1710417600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" character varying NOT NULL,
        "password" character varying NOT NULL,
        "name" character varying NOT NULL,
        "phone" character varying,
        "role" character varying NOT NULL DEFAULT 'user',
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workspaces" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "description" character varying,
        "logo" character varying,
        "status" character varying NOT NULL DEFAULT 'active',
        "created_by" uuid,
        "slug" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspaces_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_workspaces_slug" UNIQUE ("slug"),
        CONSTRAINT "FK_workspaces_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workspace_users" (
        "user_id" uuid NOT NULL,
        "workspace_id" uuid NOT NULL,
        CONSTRAINT "PK_workspace_users" PRIMARY KEY ("user_id", "workspace_id"),
        CONSTRAINT "FK_workspace_users_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_workspace_users_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workspace_users_user_id" ON "workspace_users" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workspace_users_workspace_id" ON "workspace_users" ("workspace_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "inventory_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "sku" character varying,
        "description" character varying,
        "quantity" numeric(10,2) NOT NULL,
        "costPrice" numeric(10,2) NOT NULL,
        "sellingPrice" numeric(10,2),
        "reorderLevel" numeric(10,2) NOT NULL DEFAULT 0,
        "category" character varying,
        "location" character varying,
        "supplier" character varying,
        "status" character varying NOT NULL DEFAULT 'available',
        "workspace_id" uuid,
        "created_by" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inventory_items_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_inventory_items_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transactions_type_enum') THEN
          CREATE TYPE "transactions_type_enum" AS ENUM ('sale', 'expense', 'purchase', 'return', 'adjustment', 'debt');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transactions_paymentmethod_enum') THEN
          CREATE TYPE "transactions_paymentmethod_enum" AS ENUM ('cash', 'card', 'bank', 'check', 'credit');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" "transactions_type_enum" NOT NULL,
        "referenceNumber" character varying,
        "item_id" uuid,
        "quantity" numeric(10,2) NOT NULL,
        "unitPrice" numeric(10,2) NOT NULL,
        "totalAmount" numeric(10,2) NOT NULL,
        "category" character varying,
        "paymentMethod" "transactions_paymentmethod_enum" NOT NULL DEFAULT 'cash',
        "status" character varying NOT NULL DEFAULT 'pending',
        "customerName" character varying,
        "phone" character varying,
        "dueDate" TIMESTAMP,
        "notes" character varying,
        "workspace_id" uuid,
        "created_by" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_transactions_item" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_transactions_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_transactions_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "transactions"');
    await queryRunner.query('DROP TYPE IF EXISTS "transactions_paymentmethod_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "transactions_type_enum"');

    await queryRunner.query('DROP TABLE IF EXISTS "inventory_items"');

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_workspace_users_workspace_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_workspace_users_user_id"');
    await queryRunner.query('DROP TABLE IF EXISTS "workspace_users"');

    await queryRunner.query('DROP TABLE IF EXISTS "workspaces"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');
  }
}
