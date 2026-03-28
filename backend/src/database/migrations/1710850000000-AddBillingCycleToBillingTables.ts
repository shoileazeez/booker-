import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBillingCycleToBillingTables1710850000000 implements MigrationInterface {
  name = 'AddBillingCycleToBillingTables1710850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "billing_cycle" varchar(20) NOT NULL DEFAULT 'monthly'
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD COLUMN IF NOT EXISTS "billing_cycle" varchar(20) NOT NULL DEFAULT 'monthly'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "payments" DROP COLUMN IF EXISTS "billing_cycle"',
    );
    await queryRunner.query(
      'ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "billing_cycle"',
    );
  }
}
