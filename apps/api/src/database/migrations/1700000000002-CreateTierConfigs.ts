import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTierConfigs1700000000002 implements MigrationInterface {
  name = 'CreateTierConfigs1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE tier_configs (
        id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id           UUID          NOT NULL,
        tier_name           VARCHAR(50)   NOT NULL,
        tier_label          VARCHAR(100)  NOT NULL,
        min_quarterly_spend NUMERIC(12,2) NOT NULL DEFAULT 0,
        max_quarterly_spend NUMERIC(12,2),
        display_order       INTEGER       NOT NULL DEFAULT 0,
        created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_tier_configs_tenant FOREIGN KEY (tenant_id)
          REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT uq_tier_configs_tenant_name UNIQUE (tenant_id, tier_name)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_tier_configs_tenant_id ON tier_configs(tenant_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_tier_configs_tenant_id`,
    );
    await queryRunner.query(`DROP TABLE tier_configs`);
  }
}
