import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantDeletion1700000000023 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants"
      ADD COLUMN IF NOT EXISTS "deletion_requested_at" TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS "deletion_scheduled_at" TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS "deletion_cancel_token" VARCHAR(64) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants"
      DROP COLUMN IF EXISTS "deletion_cancel_token",
      DROP COLUMN IF EXISTS "deletion_scheduled_at",
      DROP COLUMN IF EXISTS "deletion_requested_at"
    `);
  }
}
