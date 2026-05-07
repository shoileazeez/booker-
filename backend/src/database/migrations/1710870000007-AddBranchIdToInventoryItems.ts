import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBranchIdToInventoryItems1710870000006 implements MigrationInterface {
  name = 'AddBranchIdToInventoryItems1710870000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
      ADD COLUMN IF NOT EXISTS "branch_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_items"
      ADD CONSTRAINT "FK_inventory_items_branch"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_inventory_items_branch_id" ON "inventory_items" ("branch_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_inventory_items_branch_id"`,
    );

    await queryRunner.query(`
      ALTER TABLE "inventory_items"
      DROP CONSTRAINT IF EXISTS "FK_inventory_items_branch"
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_items"
      DROP COLUMN IF EXISTS "branch_id"
    `);
  }
}
