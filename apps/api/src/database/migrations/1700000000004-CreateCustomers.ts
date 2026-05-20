import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCustomers1700000000004 implements MigrationInterface {
  name = 'CreateCustomers1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE customers (
        id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id        UUID          NOT NULL,
        external_id      VARCHAR(255),
        full_name        VARCHAR(255)  NOT NULL,
        phone_e164       VARCHAR(20)   NOT NULL,
        date_of_birth    DATE,
        wa_opted_in      BOOLEAN       NOT NULL DEFAULT false,
        wa_opted_in_at   TIMESTAMPTZ,
        points_balance   INTEGER       NOT NULL DEFAULT 0,
        lifetime_points  INTEGER       NOT NULL DEFAULT 0,
        total_spend      NUMERIC(14,2) NOT NULL DEFAULT 0,
        quarterly_spend  NUMERIC(14,2) NOT NULL DEFAULT 0,
        tier_id          UUID,
        purchase_count   INTEGER       NOT NULL DEFAULT 0,
        last_purchase_at TIMESTAMPTZ,
        reward_sent_at   TIMESTAMPTZ,
        nudge_sent_at    TIMESTAMPTZ,
        lapsed_sent_at   TIMESTAMPTZ,
        source           VARCHAR(30)   NOT NULL DEFAULT 'qr_registration',
        is_active        BOOLEAN       NOT NULL DEFAULT true,
        created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_customers_tenant FOREIGN KEY (tenant_id)
          REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT fk_customers_tier FOREIGN KEY (tier_id)
          REFERENCES tier_configs(id),
        CONSTRAINT uq_customers_tenant_phone UNIQUE (tenant_id, phone_e164)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_customers_tenant_id ON customers(tenant_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_customers_tenant_phone ON customers(tenant_id, phone_e164)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_customers_tenant_tier ON customers(tenant_id, tier_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_customers_tenant_last_purchase ON customers(tenant_id, last_purchase_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_customers_date_of_birth ON customers(date_of_birth)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_customers_date_of_birth`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_customers_tenant_last_purchase`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_customers_tenant_tier`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_customers_tenant_phone`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_customers_tenant_id`,
    );
    await queryRunner.query(`DROP TABLE customers`);
  }
}
