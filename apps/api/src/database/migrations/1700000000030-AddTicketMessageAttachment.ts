import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTicketMessageAttachment1700000000030 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "support_ticket_messages"
        ADD COLUMN IF NOT EXISTS "attachment_url" TEXT,
        ADD COLUMN IF NOT EXISTS "attachment_name" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "attachment_mime_type" VARCHAR(100),
        ADD COLUMN IF NOT EXISTS "attachment_size" INTEGER
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "support_ticket_messages"
        DROP COLUMN IF EXISTS "attachment_url",
        DROP COLUMN IF EXISTS "attachment_name",
        DROP COLUMN IF EXISTS "attachment_mime_type",
        DROP COLUMN IF EXISTS "attachment_size"
    `);
  }
}
