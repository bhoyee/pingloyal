import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionFlagAndVoid1700000000033 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS is_flagged         BOOLEAN     NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS flag_reason        TEXT,
        ADD COLUMN IF NOT EXISTS voided_at          TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS voided_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_transactions_is_flagged
        ON transactions (tenant_id, is_flagged)
        WHERE is_flagged = true;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_transactions_is_flagged;
      ALTER TABLE transactions
        DROP COLUMN IF EXISTS voided_by_user_id,
        DROP COLUMN IF EXISTS voided_at,
        DROP COLUMN IF EXISTS flag_reason,
        DROP COLUMN IF EXISTS is_flagged;
    `);
  }
}
