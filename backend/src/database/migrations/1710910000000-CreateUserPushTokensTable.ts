import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserPushTokensTable1710910000000 implements MigrationInterface {
  name = 'CreateUserPushTokensTable1710910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_push_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "token" character varying(255) NOT NULL,
        "platform" character varying(32),
        "device_id" character varying(255),
        "is_active" boolean NOT NULL DEFAULT true,
        "last_seen_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_push_tokens_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_push_tokens_user_token"
      ON "user_push_tokens" ("user_id", "token")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_push_tokens_user_active"
      ON "user_push_tokens" ("user_id", "is_active")
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_user_push_tokens_user'
        ) THEN
          ALTER TABLE "user_push_tokens"
          ADD CONSTRAINT "FK_user_push_tokens_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_push_tokens" DROP CONSTRAINT IF EXISTS "FK_user_push_tokens_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_push_tokens_user_active"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_user_push_tokens_user_token"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user_push_tokens"`);
  }
}
