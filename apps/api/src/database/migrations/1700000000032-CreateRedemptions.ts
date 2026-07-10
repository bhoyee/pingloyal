import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRedemptions1700000000032 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "redemptions" (
        "id"              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenant_id"       UUID NOT NULL REFERENCES "tenants"("id"),
        "customer_id"     UUID NOT NULL REFERENCES "customers"("id"),
        "cashier_id"      UUID NOT NULL REFERENCES "users"("id"),
        "rewards_count"   INTEGER NOT NULL CHECK ("rewards_count" >= 1),
        "points_redeemed" INTEGER NOT NULL CHECK ("points_redeemed" > 0),
        "value"           NUMERIC(14,2) NOT NULL,
        "balance_after"   INTEGER NOT NULL,
        "notes"           TEXT,
        "redeemed_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_redemptions_tenant_id" ON "redemptions"("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_redemptions_customer_id" ON "redemptions"("customer_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "redemptions"`);
  }
}
