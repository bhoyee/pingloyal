import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGlobalEmailUniqueness1700000000024 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users" SET "email" = LOWER("email") WHERE "email" != LOWER("email")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_email_lower" ON "users" (LOWER("email"))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_users_email_lower"
    `);
  }
}
