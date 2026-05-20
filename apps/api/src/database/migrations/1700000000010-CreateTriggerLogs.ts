import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTriggerLogs1700000000010 implements MigrationInterface {
  name = 'CreateTriggerLogs1700000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE trigger_logs (
        id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id      UUID         NOT NULL,
        customer_id    UUID         NOT NULL,
        trigger_type   VARCHAR(50)  NOT NULL,
        wa_message_id  VARCHAR(255),
        status         VARCHAR(30)  NOT NULL DEFAULT 'sent',
        skip_reason    VARCHAR(100),
        created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_trigger_logs_tenant FOREIGN KEY (tenant_id)
          REFERENCES tenants(id),
        CONSTRAINT fk_trigger_logs_customer FOREIGN KEY (customer_id)
          REFERENCES customers(id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_trigger_logs_tenant_customer_type_created
        ON trigger_logs(tenant_id, customer_id, trigger_type, created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_trigger_logs_tenant_customer_type_created`,
    );
    await queryRunner.query(`DROP TABLE trigger_logs`);
  }
}
