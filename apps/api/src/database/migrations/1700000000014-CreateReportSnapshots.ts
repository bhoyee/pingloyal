import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReportSnapshots1700000000014 implements MigrationInterface {
  name = 'CreateReportSnapshots1700000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE report_snapshots (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id    UUID        NOT NULL,
        period_start DATE        NOT NULL,
        period_end   DATE        NOT NULL,
        period_type  VARCHAR(20) NOT NULL,
        data         JSONB       NOT NULL,
        computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_report_snapshots_tenant FOREIGN KEY (tenant_id)
          REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT uq_report_snapshots_tenant_period
          UNIQUE (tenant_id, period_start, period_end, period_type)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_report_snapshots_tenant_period
        ON report_snapshots(tenant_id, period_start DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_report_snapshots_tenant_period`,
    );
    await queryRunner.query(`DROP TABLE report_snapshots`);
  }
}
