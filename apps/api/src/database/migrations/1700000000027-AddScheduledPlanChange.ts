import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddScheduledPlanChange1700000000027 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "pending_plan_tier" VARCHAR(30) NULL,
      ADD COLUMN IF NOT EXISTS "pending_plan_effective_at" TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS "pending_plan_reference" VARCHAR(100) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      DROP COLUMN IF EXISTS "pending_plan_reference",
      DROP COLUMN IF EXISTS "pending_plan_effective_at",
      DROP COLUMN IF EXISTS "pending_plan_tier"
    `);
  }
}
