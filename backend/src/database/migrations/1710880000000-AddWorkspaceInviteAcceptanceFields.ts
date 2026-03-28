import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkspaceInviteAcceptanceFields1710880000000 implements MigrationInterface {
  name = 'AddWorkspaceInviteAcceptanceFields1710880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workspace_invites" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" character varying NOT NULL,
        "userId" uuid,
        "workspace_id" uuid NOT NULL,
        "status" character varying NOT NULL DEFAULT 'pending',
        "role" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspace_invites_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_workspace_invites_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "workspace_invites"
      ADD COLUMN IF NOT EXISTS "invite_code" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "workspace_invites"
      ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP
    `);

    await queryRunner.query(`
      ALTER TABLE "workspace_invites"
      ADD COLUMN IF NOT EXISTS "accepted_at" TIMESTAMP
    `);

    await queryRunner.query(`
      UPDATE "workspace_invites"
      SET "expires_at" = COALESCE("expires_at", "createdAt" + INTERVAL '7 days')
      WHERE "expires_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workspace_invites_email_status"
      ON "workspace_invites" ("email", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_workspace_invites_email_status"',
    );
    await queryRunner.query(
      'ALTER TABLE "workspace_invites" DROP COLUMN IF EXISTS "accepted_at"',
    );
    await queryRunner.query(
      'ALTER TABLE "workspace_invites" DROP COLUMN IF EXISTS "expires_at"',
    );
    await queryRunner.query(
      'ALTER TABLE "workspace_invites" DROP COLUMN IF EXISTS "invite_code"',
    );
  }
}
