import { MigrationInterface, QueryRunner } from 'typeorm';

// Backfills the one existing seeded staff row as 'super_admin' — every row
// created afterward (via the new staff management API) passes an explicit
// role, so this default only matters for migration day.
export class AddStaffRoleAndStatus1700000000032 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "staff"
        ADD COLUMN IF NOT EXISTS "role" VARCHAR(20) NOT NULL DEFAULT 'super_admin',
        ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "staff"
        DROP COLUMN IF EXISTS "role",
        DROP COLUMN IF EXISTS "is_active"
    `);
  }
}
