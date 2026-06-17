/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../../../../.env') });

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: false,
  entities: [],
});

async function main() {
  await ds.initialize();
  const result = await ds.query(
    `DELETE FROM report_snapshots
     WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'jadefy-store')`,
  );
  console.log('Deleted snapshots. Result:', JSON.stringify(result));
  await ds.destroy();
}

main().catch((e: unknown) => {
  console.error(String(e));
  process.exit(1);
});
