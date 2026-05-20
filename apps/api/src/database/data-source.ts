import { DataSource } from 'typeorm';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

// Compiled file lives at dist/database/; project root is ../../../../ from there.
// Try local app .env first, then monorepo root.
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../../../../.env') });

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required. Ensure .env is configured before running migrations.',
  );
}

// Single named export — TypeORM CLI requires exactly one DataSource export per file
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [path.join(__dirname, '../**/*.entity.js')],
  migrations: [path.join(__dirname, './migrations/*.js')],
  migrationsTableName: 'typeorm_migrations',
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
});
