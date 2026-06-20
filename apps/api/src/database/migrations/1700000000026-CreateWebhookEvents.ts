import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWebhookEvents1700000000026 implements MigrationInterface {
  name = 'CreateWebhookEvents1700000000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        provider     VARCHAR(20)  NOT NULL,
        event_id     VARCHAR(255) NOT NULL,
        event_type   VARCHAR(100) NOT NULL,
        processed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_provider_event_id_idx
        ON webhook_events (provider, event_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS webhook_events_provider_event_id_idx`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS webhook_events`);
  }
}
