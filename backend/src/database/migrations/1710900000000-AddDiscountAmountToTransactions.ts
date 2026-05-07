import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDiscountAmountToTransactions1710900000000 implements MigrationInterface {
  name = 'AddDiscountAmountToTransactions1710900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD COLUMN IF NOT EXISTS "discountAmount" numeric(10,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transactions"
      DROP COLUMN IF EXISTS "discountAmount"
    `);
  }
}
