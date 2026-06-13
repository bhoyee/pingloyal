import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordReset1700000000018 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "password_reset_token" VARCHAR(64) NULL,
      ADD COLUMN IF NOT EXISTS "password_reset_expiry" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "password_reset_expiry",
      DROP COLUMN IF EXISTS "password_reset_token"
    `);
  }
}
