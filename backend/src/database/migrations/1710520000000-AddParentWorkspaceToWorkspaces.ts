import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddParentWorkspaceToWorkspaces1710520000000 implements MigrationInterface {
  name = 'AddParentWorkspaceToWorkspaces1710520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspaces"
      ADD COLUMN IF NOT EXISTS "parent_workspace_id" uuid NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_workspaces_parent_workspace'
            AND table_name = 'workspaces'
        ) THEN
          ALTER TABLE "workspaces"
          ADD CONSTRAINT "FK_workspaces_parent_workspace"
          FOREIGN KEY ("parent_workspace_id") REFERENCES "workspaces"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workspaces_parent_workspace_id"
      ON "workspaces" ("parent_workspace_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_workspaces_parent_workspace_id"');
    await queryRunner.query('ALTER TABLE "workspaces" DROP CONSTRAINT IF EXISTS "FK_workspaces_parent_workspace"');
    await queryRunner.query('ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "parent_workspace_id"');
  }
}
