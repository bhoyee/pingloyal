import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillCustomerTiers1700000000017 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Customers registered before tier assignment was wired up have
    // tier_id = NULL even though their tenant has tier configs and their
    // quarterly_spend (e.g. 0) qualifies for one. Backfill those.
    await queryRunner.query(`
      UPDATE customers c
      SET tier_id = (
        SELECT tc.id FROM tier_configs tc
        WHERE tc.tenant_id = c.tenant_id
          AND c.quarterly_spend >= tc.min_quarterly_spend
          AND (tc.max_quarterly_spend IS NULL OR c.quarterly_spend <= tc.max_quarterly_spend)
        ORDER BY tc.min_quarterly_spend DESC
        LIMIT 1
      ),
      updated_at = NOW()
      WHERE c.tier_id IS NULL
        AND c.is_active = true
        AND EXISTS (SELECT 1 FROM tier_configs tc WHERE tc.tenant_id = c.tenant_id)
    `);
  }

  public async down(): Promise<void> {
    // Data backfill — not reversible.
  }
}
