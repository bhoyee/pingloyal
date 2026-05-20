import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCampaignLogs1700000000009 implements MigrationInterface {
  name = 'CreateCampaignLogs1700000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE campaign_logs (
        id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id      UUID         NOT NULL,
        campaign_id    UUID         NOT NULL,
        customer_id    UUID         NOT NULL,
        wa_message_id  VARCHAR(255),
        status         VARCHAR(30)  NOT NULL DEFAULT 'queued',
        error_message  TEXT,
        queued_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        sent_at        TIMESTAMPTZ,
        delivered_at   TIMESTAMPTZ,
        failed_at      TIMESTAMPTZ,

        CONSTRAINT fk_campaign_logs_tenant FOREIGN KEY (tenant_id)
          REFERENCES tenants(id),
        CONSTRAINT fk_campaign_logs_campaign FOREIGN KEY (campaign_id)
          REFERENCES campaigns(id) ON DELETE CASCADE,
        CONSTRAINT fk_campaign_logs_customer FOREIGN KEY (customer_id)
          REFERENCES customers(id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_campaign_logs_campaign_id ON campaign_logs(campaign_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_campaign_logs_tenant_customer ON campaign_logs(tenant_id, customer_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_campaign_logs_campaign_status ON campaign_logs(campaign_id, status)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_campaign_logs_campaign_status`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_campaign_logs_tenant_customer`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_campaign_logs_campaign_id`,
    );
    await queryRunner.query(`DROP TABLE campaign_logs`);
  }
}
