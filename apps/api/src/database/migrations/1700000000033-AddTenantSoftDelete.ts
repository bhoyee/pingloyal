import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantSoftDelete1700000000033 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS "deleted_by_staff_id" UUID NULL,
      ADD COLUMN IF NOT EXISTS "deletion_reason" TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants"
      DROP COLUMN IF EXISTS "deletion_reason",
      DROP COLUMN IF EXISTS "deleted_by_staff_id",
      DROP COLUMN IF EXISTS "deleted_at"
    `);
  }
}
