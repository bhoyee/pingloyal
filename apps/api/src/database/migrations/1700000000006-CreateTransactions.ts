import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactions1700000000006 implements MigrationInterface {
  name = 'CreateTransactions1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE transactions (
        id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        idempotency_key         VARCHAR(255)  NOT NULL,
        tenant_id               UUID          NOT NULL,
        customer_id             UUID          NOT NULL,
        category_id             UUID,
        logged_by_user_id       UUID,
        amount                  NUMERIC(12,2) NOT NULL,
        points_earned           INTEGER       NOT NULL DEFAULT 0,
        points_balance_after    INTEGER       NOT NULL,
        source                  VARCHAR(30)   NOT NULL DEFAULT 'cashier_app',
        external_transaction_id VARCHAR(255),
        notes                   TEXT,
        created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

        CONSTRAINT uq_transactions_idempotency UNIQUE (idempotency_key),
        CONSTRAINT fk_transactions_tenant FOREIGN KEY (tenant_id)
          REFERENCES tenants(id),
        CONSTRAINT fk_transactions_customer FOREIGN KEY (customer_id)
          REFERENCES customers(id),
        CONSTRAINT fk_transactions_category FOREIGN KEY (category_id)
          REFERENCES product_categories(id),
        CONSTRAINT fk_transactions_user FOREIGN KEY (logged_by_user_id)
          REFERENCES users(id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_transactions_tenant_id ON transactions(tenant_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_transactions_tenant_customer ON transactions(tenant_id, customer_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_transactions_tenant_category ON transactions(tenant_id, category_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_transactions_tenant_created ON transactions(tenant_id, created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_transactions_tenant_created`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_transactions_tenant_category`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_transactions_tenant_customer`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_transactions_tenant_id`);
    await queryRunner.query(`DROP TABLE transactions`);
  }
}
