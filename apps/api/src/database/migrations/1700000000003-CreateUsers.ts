import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1700000000003 implements MigrationInterface {
  name = 'CreateUsers1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id        UUID         NOT NULL,
        email            VARCHAR(255) NOT NULL,
        hashed_password  TEXT         NOT NULL,
        full_name        VARCHAR(255) NOT NULL,
        role             VARCHAR(30)  NOT NULL DEFAULT 'owner',
        is_active        BOOLEAN      NOT NULL DEFAULT true,
        last_login_at    TIMESTAMPTZ,
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id)
          REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT uq_users_tenant_email UNIQUE (tenant_id, email)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_users_tenant_id ON users(tenant_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_users_tenant_email ON users(tenant_id, email)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_tenant_email`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_tenant_id`);
    await queryRunner.query(`DROP TABLE users`);
  }
}
