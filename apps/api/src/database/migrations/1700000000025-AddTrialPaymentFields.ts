import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTrialPaymentFields1700000000025 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "paystack_authorization_code" VARCHAR(100) NULL,
      ADD COLUMN IF NOT EXISTS "trial_charge_attempts" INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "last_charge_attempt_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      DROP COLUMN IF EXISTS "last_charge_attempt_at",
      DROP COLUMN IF EXISTS "trial_charge_attempts",
      DROP COLUMN IF EXISTS "paystack_authorization_code"
    `);
  }
}
