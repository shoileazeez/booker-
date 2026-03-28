import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOtpFieldsToUsers1710860000000 implements MigrationInterface {
  name = 'AddOtpFieldsToUsers1710860000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "email_verified" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "email_verification_code" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "email_verification_expires_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "email_verification_last_sent_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "password_reset_code" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "password_reset_expires_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "password_reset_last_sent_at" TIMESTAMP`,
    );

    // Legacy users are considered verified to prevent login regressions.
    await queryRunner.query(
      `UPDATE "users" SET "email_verified" = true WHERE "email_verified" = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "password_reset_last_sent_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "password_reset_expires_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "password_reset_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "email_verification_last_sent_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "email_verification_expires_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "email_verification_code"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_verified"`);
  }
}
