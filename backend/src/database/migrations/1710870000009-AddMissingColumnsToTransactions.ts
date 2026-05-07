import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingColumnsToTransactions1710870000008 implements MigrationInterface {
  name = 'AddMissingColumnsToTransactions1710870000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD COLUMN IF NOT EXISTS "branch_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD COLUMN IF NOT EXISTS "receipt_url" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD CONSTRAINT "FK_transactions_branch"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transactions_branch_id" ON "transactions" ("branch_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transactions_branch_id"`,
    );

    await queryRunner.query(`
      ALTER TABLE "transactions"
      DROP CONSTRAINT IF EXISTS "FK_transactions_branch"
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
      DROP COLUMN IF EXISTS "receipt_url"
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
      DROP COLUMN IF EXISTS "branch_id"
    `);
  }
}
