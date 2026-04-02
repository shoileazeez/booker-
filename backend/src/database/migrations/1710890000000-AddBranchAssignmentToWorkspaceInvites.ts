import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBranchAssignmentToWorkspaceInvites1710890000000
  implements MigrationInterface
{
  name = 'AddBranchAssignmentToWorkspaceInvites1710890000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_invites"
      ADD COLUMN IF NOT EXISTS "branch_id" uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_invites"
      ADD COLUMN IF NOT EXISTS "branch_role" character varying NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_invites"
      ADD COLUMN IF NOT EXISTS "branch_permissions" jsonb NULL
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_workspace_invites_branch'
        ) THEN
          ALTER TABLE "workspace_invites"
          ADD CONSTRAINT "FK_workspace_invites_branch"
          FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workspace_invites_branch_id"
      ON "workspace_invites" ("branch_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_workspace_invites_branch_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "workspace_invites"
      DROP CONSTRAINT IF EXISTS "FK_workspace_invites_branch"
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_invites"
      DROP COLUMN IF EXISTS "branch_permissions"
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_invites"
      DROP COLUMN IF EXISTS "branch_role"
    `);
    await queryRunner.query(`
      ALTER TABLE "workspace_invites"
      DROP COLUMN IF EXISTS "branch_id"
    `);
  }
}
