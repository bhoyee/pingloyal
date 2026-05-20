import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWalletTransactions1700000000013
  implements MigrationInterface
{
  name = 'CreateWalletTransactions1700000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE wallet_transactions (
        id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     UUID          NOT NULL,
        type          VARCHAR(30)   NOT NULL,
        amount        NUMERIC(12,2) NOT NULL,
        balance_after NUMERIC(12,2) NOT NULL,
        description   TEXT          NOT NULL,
        ref_id        UUID,
        paystack_ref  VARCHAR(255),
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_wallet_transactions_tenant FOREIGN KEY (tenant_id)
          REFERENCES tenants(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_wallet_transactions_tenant_created
        ON wallet_transactions(tenant_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_wallet_transactions_tenant_type
        ON wallet_transactions(tenant_id, type)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_wallet_transactions_tenant_type`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_wallet_transactions_tenant_created`,
    );
    await queryRunner.query(`DROP TABLE wallet_transactions`);
  }
}
