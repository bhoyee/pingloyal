import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePointsLedger1700000000007 implements MigrationInterface {
  name = 'CreatePointsLedger1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE points_ledger (
        id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id          UUID        NOT NULL,
        customer_id        UUID        NOT NULL,
        delta              INTEGER     NOT NULL,
        reason             VARCHAR(50) NOT NULL,
        ref_transaction_id UUID,
        ref_campaign_id    UUID,
        balance_after      INTEGER     NOT NULL,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_points_ledger_tenant FOREIGN KEY (tenant_id)
          REFERENCES tenants(id),
        CONSTRAINT fk_points_ledger_customer FOREIGN KEY (customer_id)
          REFERENCES customers(id),
        CONSTRAINT fk_points_ledger_transaction FOREIGN KEY (ref_transaction_id)
          REFERENCES transactions(id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_points_ledger_tenant_customer_created
        ON points_ledger(tenant_id, customer_id, created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_points_ledger_tenant_customer_created`,
    );
    await queryRunner.query(`DROP TABLE points_ledger`);
  }
}
