import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIntegrations1700000000011 implements MigrationInterface {
  name = 'CreateIntegrations1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE integrations (
        id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id           UUID         NOT NULL,
        connection_type     VARCHAR(30)  NOT NULL,
        endpoint_url        TEXT,
        api_key_encrypted   TEXT,
        webhook_secret      VARCHAR(255),
        poll_interval_mins  INTEGER      NOT NULL DEFAULT 5,
        field_mapping       JSONB        NOT NULL DEFAULT '{}',
        last_synced_at      TIMESTAMPTZ,
        last_sync_cursor    VARCHAR(255),
        sync_status         VARCHAR(30)  NOT NULL DEFAULT 'pending',
        error_message       TEXT,
        created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_integrations_tenant FOREIGN KEY (tenant_id)
          REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT uq_integrations_tenant UNIQUE (tenant_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE integrations`);
  }
}
