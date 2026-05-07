import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStockTransfersTable1710870000002 implements MigrationInterface {
  name = 'CreateStockTransfersTable1710870000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_transfers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" uuid NOT NULL,
        "source_branch_id" uuid NOT NULL,
        "destination_branch_id" uuid NOT NULL,
        "source_item_id" uuid NOT NULL,
        "destination_item_id" uuid,
        "quantity" numeric(10,2) NOT NULL,
        "status" character varying NOT NULL DEFAULT 'completed',
        "reason" character varying,
        "notes" character varying,
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_transfers_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stock_transfers_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_transfers_source_branch" FOREIGN KEY ("source_branch_id") REFERENCES "branches"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_transfers_destination_branch" FOREIGN KEY ("destination_branch_id") REFERENCES "branches"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_transfers_source_item" FOREIGN KEY ("source_item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_transfers_destination_item" FOREIGN KEY ("destination_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_stock_transfers_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_transfers_workspace_id" ON "stock_transfers" ("workspace_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_transfers_source_branch_id" ON "stock_transfers" ("source_branch_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_transfers_destination_branch_id" ON "stock_transfers" ("destination_branch_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stock_transfers_destination_branch_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stock_transfers_source_branch_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stock_transfers_workspace_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_transfers"`);
  }
}
