import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkspaceMembershipRoles1710870000000 implements MigrationInterface {
  name = 'AddWorkspaceMembershipRoles1710870000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_users"
      ADD COLUMN IF NOT EXISTS "role" character varying NOT NULL DEFAULT 'staff'
    `);

    await queryRunner.query(`
      ALTER TABLE "workspace_users"
      ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true
    `);

    await queryRunner.query(`
      ALTER TABLE "workspace_users"
      ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP NOT NULL DEFAULT now()
    `);

    await queryRunner.query(`
      ALTER TABLE "workspace_users"
      ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    `);

    await queryRunner.query(`
      UPDATE "workspace_users" wu
      SET "role" = CASE
        WHEN w."created_by" = wu."user_id" THEN 'owner'
        WHEN w."manager_user_id" = wu."user_id" THEN 'manager'
        ELSE 'staff'
      END
      FROM "workspaces" w
      WHERE w."id" = wu."workspace_id"
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workspace_users_workspace_active"
      ON "workspace_users" ("workspace_id", "is_active")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_workspace_users_workspace_active"',
    );
    await queryRunner.query(
      'ALTER TABLE "workspace_users" DROP COLUMN IF EXISTS "updated_at"',
    );
    await queryRunner.query(
      'ALTER TABLE "workspace_users" DROP COLUMN IF EXISTS "created_at"',
    );
    await queryRunner.query(
      'ALTER TABLE "workspace_users" DROP COLUMN IF EXISTS "is_active"',
    );
    await queryRunner.query(
      'ALTER TABLE "workspace_users" DROP COLUMN IF EXISTS "role"',
    );
  }
}
