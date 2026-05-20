import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductCategories1700000000005
  implements MigrationInterface
{
  name = 'CreateProductCategories1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE product_categories (
        id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id  UUID         NOT NULL,
        name       VARCHAR(100) NOT NULL,
        slug       VARCHAR(100) NOT NULL,
        is_active  BOOLEAN      NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_product_categories_tenant FOREIGN KEY (tenant_id)
          REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT uq_product_categories_tenant_slug UNIQUE (tenant_id, slug)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_product_categories_tenant_id ON product_categories(tenant_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_product_categories_tenant_id`,
    );
    await queryRunner.query(`DROP TABLE product_categories`);
  }
}
