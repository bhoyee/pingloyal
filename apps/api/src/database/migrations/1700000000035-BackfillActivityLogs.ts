import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillActivityLogs1700000000035 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Backfill customer registrations
    await queryRunner.query(`
      INSERT INTO activity_logs (id, tenant_id, action, entity_type, entity_id, description, created_at)
      SELECT
        gen_random_uuid(),
        c.tenant_id,
        'customer.registered',
        'customer',
        c.id,
        'New customer ' || c.full_name || ' (' || c.phone_e164 || ') registered',
        c.created_at
      FROM customers c
      WHERE c.created_at >= NOW() - INTERVAL '90 days'
    `);

    // Backfill non-voided transactions
    await queryRunner.query(`
      INSERT INTO activity_logs (id, tenant_id, action, entity_type, entity_id, description, created_at)
      SELECT
        gen_random_uuid(),
        t.tenant_id,
        'transaction.created',
        'transaction',
        t.id,
        '₦' || ROUND(t.amount::numeric)::text || ' sale for ' || COALESCE(c.full_name, 'Unknown') || ' (+' || t.points_earned || ' pts)',
        t.created_at
      FROM transactions t
      LEFT JOIN customers c ON c.id = t.customer_id
      WHERE t.voided_at IS NULL
        AND t.created_at >= NOW() - INTERVAL '90 days'
    `);

    // Backfill voided transactions (log the void event at voided_at time)
    await queryRunner.query(`
      INSERT INTO activity_logs (id, tenant_id, action, entity_type, entity_id, description, created_at)
      SELECT
        gen_random_uuid(),
        t.tenant_id,
        'transaction.voided',
        'transaction',
        t.id,
        '₦' || ROUND(t.amount::numeric)::text || ' transaction voided for ' || COALESCE(c.full_name, 'Unknown') || ' (-' || t.points_earned || ' pts)',
        COALESCE(t.voided_at, t.created_at)
      FROM transactions t
      LEFT JOIN customers c ON c.id = t.customer_id
      WHERE t.voided_at IS NOT NULL
        AND t.created_at >= NOW() - INTERVAL '90 days'
    `);

    // Backfill redemptions
    await queryRunner.query(`
      INSERT INTO activity_logs (id, tenant_id, action, entity_type, entity_id, description, created_at)
      SELECT
        gen_random_uuid(),
        r.tenant_id,
        'redemption.created',
        'redemption',
        r.id,
        r.rewards_count || ' reward' || CASE WHEN r.rewards_count > 1 THEN 's' ELSE '' END ||
        ' redeemed — ₦' || ROUND(r.value::numeric)::text || ' value (' || r.points_redeemed || ' pts deducted)',
        r.redeemed_at
      FROM redemptions r
      WHERE r.redeemed_at >= NOW() - INTERVAL '90 days'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM activity_logs
      WHERE action IN (
        'transaction.created', 'transaction.voided',
        'customer.registered', 'redemption.created'
      )
      AND actor_id IS NULL
    `);
  }
}
