import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLineItemsToTransactions1712000000001 implements MigrationInterface {
  name = 'AddLineItemsToTransactions1712000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "line_items" jsonb DEFAULT '[]'::jsonb`);
    await queryRunner.query(`ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "customer_email" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS "line_items"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS "customer_email"`);
  }
}
