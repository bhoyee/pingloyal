import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailVerification1700000000016 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS "email_verification_token" VARCHAR(64) NULL,
      ADD COLUMN IF NOT EXISTS "email_verification_expiry" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "email_verification_expiry",
      DROP COLUMN IF EXISTS "email_verification_token",
      DROP COLUMN IF EXISTS "email_verified_at"
    `);
  }
}
