import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWaTriggerTemplates1700000000021 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "wa_trigger_templates" (
        "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"    UUID         NOT NULL,
        "trigger_type" VARCHAR(50)  NOT NULL,
        "body"         TEXT         NOT NULL,
        "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_wa_trigger_templates" PRIMARY KEY ("id"),
        CONSTRAINT "uq_wa_trigger_templates_tenant_type"
          UNIQUE ("tenant_id", "trigger_type"),
        CONSTRAINT "fk_wa_trigger_templates_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_wa_trigger_templates_tenant_id"
        ON "wa_trigger_templates" ("tenant_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "wa_trigger_templates"`);
  }
}
