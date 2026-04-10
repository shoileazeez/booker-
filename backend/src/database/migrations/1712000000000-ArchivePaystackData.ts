import { MigrationInterface, QueryRunner } from 'typeorm';

export class ArchivePaystackData1712000000000 implements MigrationInterface {
  name = 'ArchivePaystackData1712000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create archive table for payments
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payments_archive" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "original_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "reference" varchar NOT NULL,
        "status" varchar(20) NOT NULL,
        "amount" int NOT NULL,
        "currency" varchar(10) NOT NULL,
        "purchase_type" varchar(30) NULL,
        "target_plan" varchar(20) NULL,
        "addon_workspace_slots" int NOT NULL DEFAULT 0,
        "addon_staff_seats" int NOT NULL DEFAULT 0,
        "addon_whatsapp_bundles" int NOT NULL DEFAULT 0,
        "paystack_transaction_id" varchar NULL,
        "metadata" jsonb NULL,
        "raw_response" jsonb NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "archived_at" timestamp NOT NULL DEFAULT now()
      )
    `);

    // Move payments with paystack_transaction_id into archive
    await queryRunner.query(`
      INSERT INTO "payments_archive" (original_id, user_id, reference, status, amount, currency, purchase_type, target_plan, addon_workspace_slots, addon_staff_seats, addon_whatsapp_bundles, paystack_transaction_id, metadata, raw_response, created_at)
      SELECT id, user_id, reference, status, amount, currency, purchase_type, target_plan, addon_workspace_slots, addon_staff_seats, addon_whatsapp_bundles, paystack_transaction_id, metadata, raw_response, created_at
      FROM "payments"
      WHERE paystack_transaction_id IS NOT NULL
    `);

    // Null out paystack fields in payments and subscriptions to stop future use
    await queryRunner.query(`
      UPDATE "payments" SET paystack_transaction_id = NULL WHERE paystack_transaction_id IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "subscriptions" SET paystack_customer_code = NULL, paystack_subscription_code = NULL WHERE paystack_customer_code IS NOT NULL OR paystack_subscription_code IS NOT NULL
    `);

    // Optionally add a comment to indicate archival ran
    await queryRunner.query(`COMMENT ON TABLE "payments_archive" IS 'Archive of payments previously associated with Paystack. Created by migration ArchivePaystackData1712000000000';`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Move archived rows back to payments (best-effort). Note: IDs may collide if new rows were created.
    await queryRunner.query(`
      INSERT INTO "payments" (id, user_id, reference, status, amount, currency, purchase_type, target_plan, addon_workspace_slots, addon_staff_seats, addon_whatsapp_bundles, paystack_transaction_id, metadata, raw_response, created_at, updated_at)
      SELECT original_id, user_id, reference, status, amount, currency, purchase_type, target_plan, addon_workspace_slots, addon_staff_seats, addon_whatsapp_bundles, paystack_transaction_id, metadata, raw_response, created_at, now()
      FROM "payments_archive"
    `);

    // Drop archive table
    await queryRunner.query('DROP TABLE IF EXISTS "payments_archive"');
  }
}
