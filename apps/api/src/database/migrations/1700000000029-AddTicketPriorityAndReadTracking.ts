import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTicketPriorityAndReadTracking1700000000029 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "support_tickets"
        ADD COLUMN IF NOT EXISTS "priority" VARCHAR(10) NOT NULL DEFAULT 'low',
        ADD COLUMN IF NOT EXISTS "tenant_last_read_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "last_message_author_type" VARCHAR(10)
    `);
    // Backfill so existing rows have a sensible "last message was from the
    // tenant" default rather than NULL — matches the fact every ticket
    // starts with the tenant's own opening message.
    await queryRunner.query(`
      UPDATE "support_tickets" SET "last_message_author_type" = 'tenant'
      WHERE "last_message_author_type" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "support_tickets"
        DROP COLUMN IF EXISTS "priority",
        DROP COLUMN IF EXISTS "tenant_last_read_at",
        DROP COLUMN IF EXISTS "last_message_author_type"
    `);
  }
}
