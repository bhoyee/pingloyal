import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenants1700000000001 implements MigrationInterface {
  name = 'CreateTenants1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE tenants (
        id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        business_name             VARCHAR(255)  NOT NULL,
        slug                      VARCHAR(100)  NOT NULL,

        -- WhatsApp / Gupshup BSP
        wa_phone_number           VARCHAR(20),
        gupshup_app_id            VARCHAR(255),
        gupshup_api_key           TEXT,
        wa_display_name           VARCHAR(255),
        wa_business_category      VARCHAR(100),
        wa_business_description   TEXT,
        wa_business_website       VARCHAR(500),
        wa_verification_status    VARCHAR(30)   NOT NULL DEFAULT 'pending',
        wa_verified_at            TIMESTAMPTZ,

        -- Marketing wallet
        marketing_wallet_balance  NUMERIC(12,2) NOT NULL DEFAULT 0,
        wallet_last_topped_up_at  TIMESTAMPTZ,
        wallet_low_alert_sent_at  TIMESTAMPTZ,

        -- Branding
        logo_url                  TEXT,
        qr_code_url               TEXT,

        -- Platform config
        mode                      VARCHAR(20)   NOT NULL DEFAULT 'native',
        plan_tier                 VARCHAR(30)   NOT NULL DEFAULT 'starter',
        points_earn_rate          NUMERIC(10,4) NOT NULL DEFAULT 1,
        points_threshold          INTEGER       NOT NULL DEFAULT 1000,
        reward_value              NUMERIC(10,2) NOT NULL DEFAULT 1000,
        lapsed_days               INTEGER       NOT NULL DEFAULT 60,
        currency                  VARCHAR(3)    NOT NULL DEFAULT 'NGN',
        timezone                  VARCHAR(50)   NOT NULL DEFAULT 'Africa/Lagos',
        subscription_status       VARCHAR(30)   NOT NULL DEFAULT 'trialing',
        trial_ends_at             TIMESTAMPTZ,
        paystack_customer_id      VARCHAR(100),
        stripe_customer_id        VARCHAR(100),

        created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

        CONSTRAINT uq_tenants_slug UNIQUE (slug)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE tenants`);
  }
}
