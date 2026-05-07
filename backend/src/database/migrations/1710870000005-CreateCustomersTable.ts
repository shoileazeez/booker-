import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCustomersTable1710870000004 implements MigrationInterface {
  name = 'CreateCustomersTable1710870000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "email" character varying,
        "phone" character varying,
        "address" character varying,
        "workspace_id" uuid,
        "branch_id" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customers_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_customers_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_customers_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customers_workspace_id" ON "customers" ("workspace_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customers_branch_id" ON "customers" ("branch_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customers_email" ON "customers" ("email")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customers_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customers_branch_id"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_customers_workspace_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "customers"`);
  }
}
