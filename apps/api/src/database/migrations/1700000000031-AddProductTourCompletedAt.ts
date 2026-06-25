import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductTourCompletedAt1700000000031 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "product_tour_completed_at" TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "product_tour_completed_at"
    `);
  }
}
