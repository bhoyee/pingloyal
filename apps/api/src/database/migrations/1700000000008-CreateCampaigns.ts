import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCampaigns1700000000008 implements MigrationInterface {
  name = 'CreateCampaigns1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE campaigns (
        id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id         UUID         NOT NULL,
        name              VARCHAR(255) NOT NULL,
        message_body      TEXT         NOT NULL,
        segment_rules     JSONB        NOT NULL DEFAULT '{}',
        status            VARCHAR(30)  NOT NULL DEFAULT 'draft',
        scheduled_at      TIMESTAMPTZ,
        sent_at           TIMESTAMPTZ,
        total_recipients  INTEGER      NOT NULL DEFAULT 0,
        sent_count        INTEGER      NOT NULL DEFAULT 0,
        delivered_count   INTEGER      NOT NULL DEFAULT 0,
        failed_count      INTEGER      NOT NULL DEFAULT 0,
        created_by        UUID,
        created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_campaigns_tenant FOREIGN KEY (tenant_id)
          REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT fk_campaigns_created_by FOREIGN KEY (created_by)
          REFERENCES users(id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_campaigns_tenant_id ON campaigns(tenant_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_campaigns_tenant_status ON campaigns(tenant_id, status)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_campaigns_scheduled_at ON campaigns(scheduled_at)
        WHERE status = 'scheduled'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_campaigns_scheduled_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_campaigns_tenant_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_campaigns_tenant_id`);
    await queryRunner.query(`DROP TABLE campaigns`);
  }
}
