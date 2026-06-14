import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCampaignDeletionTracking1700000000019
  implements MigrationInterface
{
  name = 'AddCampaignDeletionTracking1700000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "campaigns"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS "deleted_by" UUID NULL,
      ADD COLUMN IF NOT EXISTS "deletion_reason" TEXT NULL,
      ADD CONSTRAINT "fk_campaigns_deleted_by" FOREIGN KEY ("deleted_by")
        REFERENCES "users"("id")
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_campaigns_deleted_at" ON "campaigns"("deleted_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_campaigns_deleted_at"`,
    );
    await queryRunner.query(`
      ALTER TABLE "campaigns"
      DROP CONSTRAINT IF EXISTS "fk_campaigns_deleted_by",
      DROP COLUMN IF EXISTS "deletion_reason",
      DROP COLUMN IF EXISTS "deleted_by",
      DROP COLUMN IF EXISTS "deleted_at"
    `);
  }
}
