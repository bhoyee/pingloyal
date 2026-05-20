import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReportSchedules1700000000015 implements MigrationInterface {
  name = 'CreateReportSchedules1700000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE report_schedules (
        id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id   UUID         NOT NULL,
        email       VARCHAR(255) NOT NULL,
        frequency   VARCHAR(20)  NOT NULL DEFAULT 'monthly',
        is_active   BOOLEAN      NOT NULL DEFAULT true,
        last_sent_at TIMESTAMPTZ,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_report_schedules_tenant FOREIGN KEY (tenant_id)
          REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT uq_report_schedules_tenant UNIQUE (tenant_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE report_schedules`);
  }
}
