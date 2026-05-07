import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDueReminderSentAtToTransactions1714571345000 implements MigrationInterface {
  name = 'AddDueReminderSentAtToTransactions1714571345000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "due_reminder_sent_at" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN IF EXISTS "due_reminder_sent_at"`,
    );
  }
}
