import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActorNameToActivityLogs1700000000036 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE activity_logs
      ADD COLUMN IF NOT EXISTS actor_name VARCHAR(100)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE activity_logs DROP COLUMN IF EXISTS actor_name
    `);
  }
}
