import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateActivityLogs1700000000034 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        actor_id    UUID,
        actor_role  VARCHAR(20),
        action      VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id   UUID,
        description TEXT        NOT NULL,
        metadata    JSONB,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_created
        ON activity_logs (tenant_id, created_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS activity_logs`);
  }
}
