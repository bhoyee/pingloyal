import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTemplateRequests1700000000022 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "template_requests" (
        "id"         UUID          NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"  UUID          NOT NULL,
        "name"       VARCHAR(200)  NOT NULL,
        "use_case"   TEXT          NOT NULL,
        "status"     VARCHAR(20)   NOT NULL DEFAULT 'pending',
        "created_at" TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_template_requests" PRIMARY KEY ("id"),
        CONSTRAINT "fk_template_requests_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_template_requests_tenant_id"
        ON "template_requests" ("tenant_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "template_requests"`);
  }
}
