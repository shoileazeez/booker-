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

    const paymentsTable = await queryRunner.getTable('payments');
    const paymentColumns = new Set(
      paymentsTable?.columns.map((column) => column.name) ?? [],
    );

    const selectExpr = (columnName: string, fallback: string) =>
      paymentColumns.has(columnName)
        ? `"${columnName}" AS "${columnName}"`
        : `${fallback} AS "${columnName}"`;

    // Move payments with paystack_transaction_id into archive
    await queryRunner.query(`
      INSERT INTO "payments_archive" (original_id, user_id, reference, status, amount, currency, purchase_type, target_plan, addon_workspace_slots, addon_staff_seats, addon_whatsapp_bundles, paystack_transaction_id, metadata, raw_response, created_at)
      SELECT
        "id" AS "original_id",
        "user_id",
        "reference",
        "status",
        "amount",
        "currency",
        ${selectExpr('purchase_type', 'NULL')},
        ${selectExpr('target_plan', 'NULL')},
        ${selectExpr('addon_workspace_slots', '0')},
        ${selectExpr('addon_staff_seats', '0')},
        ${selectExpr('addon_whatsapp_bundles', '0')},
        ${selectExpr('paystack_transaction_id', 'NULL')},
        ${selectExpr('metadata', 'NULL')},
        ${selectExpr('raw_response', 'NULL')},
        ${selectExpr('created_at', 'now()')}
      FROM "payments"
      WHERE ${
        paymentColumns.has('paystack_transaction_id')
          ? '"paystack_transaction_id" IS NOT NULL'
          : 'FALSE'
      }
    `);

    // Null out paystack fields in payments and subscriptions to stop future use
    if (paymentColumns.has('paystack_transaction_id')) {
      await queryRunner.query(`
        UPDATE "payments" SET paystack_transaction_id = NULL WHERE paystack_transaction_id IS NOT NULL
      `);
    }

    const subscriptionsTable = await queryRunner.getTable('subscriptions');
    const subscriptionColumns = new Set(
      subscriptionsTable?.columns.map((column) => column.name) ?? [],
    );

    if (
      subscriptionColumns.has('paystack_customer_code') &&
      subscriptionColumns.has('paystack_subscription_code')
    ) {
      await queryRunner.query(`
        UPDATE "subscriptions" SET paystack_customer_code = NULL, paystack_subscription_code = NULL WHERE paystack_customer_code IS NOT NULL OR paystack_subscription_code IS NOT NULL
      `);
    } else if (subscriptionColumns.has('paystack_customer_code')) {
      await queryRunner.query(`
        UPDATE "subscriptions" SET paystack_customer_code = NULL WHERE paystack_customer_code IS NOT NULL
      `);
    } else if (subscriptionColumns.has('paystack_subscription_code')) {
      await queryRunner.query(`
        UPDATE "subscriptions" SET paystack_subscription_code = NULL WHERE paystack_subscription_code IS NOT NULL
      `);
    }

    // Optionally add a comment to indicate archival ran
    await queryRunner.query(`COMMENT ON TABLE "payments_archive" IS 'Archive of payments previously associated with Paystack. Created by migration ArchivePaystackData1712000000000';`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const paymentsTable = await queryRunner.getTable('payments');
    if (!paymentsTable) {
      await queryRunner.query('DROP TABLE IF EXISTS "payments_archive"');
      return;
    }

    const paymentColumns = new Set(
      paymentsTable.columns.map((column) => column.name),
    );
    const archiveTable = await queryRunner.getTable('payments_archive');
    if (!archiveTable) {
      return;
    }

    const insertColumns: string[] = [];
    const selectColumns: string[] = [];

    const addColumn = (
      targetColumn: string,
      sourceExpression: string,
      required = false,
    ) => {
      if (required || paymentColumns.has(targetColumn)) {
        insertColumns.push(`"${targetColumn}"`);
        selectColumns.push(`${sourceExpression} AS "${targetColumn}"`);
      }
    };

    // Move archived rows back to payments (best-effort). Note: IDs may collide if new rows were created.
    addColumn('id', '"original_id"', true);
    addColumn('user_id', '"user_id"', true);
    addColumn('reference', '"reference"', true);
    addColumn('status', '"status"', true);
    addColumn('amount', '"amount"', true);
    addColumn('currency', '"currency"', true);
    addColumn('purchase_type', '"purchase_type"');
    addColumn('target_plan', '"target_plan"');
    addColumn('addon_workspace_slots', '"addon_workspace_slots"');
    addColumn('addon_staff_seats', '"addon_staff_seats"');
    addColumn('addon_whatsapp_bundles', '"addon_whatsapp_bundles"');
    addColumn('paystack_transaction_id', '"paystack_transaction_id"');
    addColumn('metadata', '"metadata"');
    addColumn('raw_response', '"raw_response"');
    addColumn('created_at', '"created_at"', true);
    addColumn('updated_at', 'now()', true);

    await queryRunner.query(`
      INSERT INTO "payments" (${insertColumns.join(', ')})
      SELECT ${selectColumns.join(', ')}
      FROM "payments_archive"
    `);

    // Drop archive table
    await queryRunner.query('DROP TABLE IF EXISTS "payments_archive"');
  }
}
