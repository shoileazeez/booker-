import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogsTable1710870000001 implements MigrationInterface {
  name = 'CreateAuditLogsTable1710870000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" uuid NOT NULL,
        "branch_id" uuid,
        "actor_user_id" uuid NOT NULL,
        "action" character varying NOT NULL,
        "entity_type" character varying NOT NULL,
        "entity_id" character varying,
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_audit_logs_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_audit_logs_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_audit_logs_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_workspace_id" ON "audit_logs" ("workspace_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_actor_user_id" ON "audit_logs" ("actor_user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_audit_logs_actor_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_audit_logs_workspace_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
  }
}
