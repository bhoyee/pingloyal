import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSubscriptions1700000000012 implements MigrationInterface {
  name = 'CreateSubscriptions1700000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE subscriptions (
        id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id                 UUID          NOT NULL,
        plan_tier                 VARCHAR(30)   NOT NULL DEFAULT 'starter',
        billing_cycle             VARCHAR(20)   NOT NULL DEFAULT 'monthly',
        currency                  VARCHAR(3)    NOT NULL DEFAULT 'NGN',
        amount                    NUMERIC(10,2) NOT NULL DEFAULT 8000,

        -- Utility message tracking (reads from this table at runtime — never hardcode rates)
        utility_included          INTEGER       NOT NULL DEFAULT 300,
        utility_used_this_period  INTEGER       NOT NULL DEFAULT 0,
        utility_overage_rate      NUMERIC(8,2)  NOT NULL DEFAULT 20.00,
        marketing_rate            NUMERIC(8,2)  NOT NULL DEFAULT 130.00,

        grace_period_started_at   TIMESTAMPTZ,
        paystack_sub_code         VARCHAR(100),
        stripe_sub_id             VARCHAR(100),
        current_period_start      TIMESTAMPTZ,
        current_period_end        TIMESTAMPTZ,
        status                    VARCHAR(30)   NOT NULL DEFAULT 'trialing',
        cancel_at_period_end      BOOLEAN       NOT NULL DEFAULT false,
        created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_subscriptions_tenant FOREIGN KEY (tenant_id)
          REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT uq_subscriptions_tenant UNIQUE (tenant_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE subscriptions`);
  }
}
