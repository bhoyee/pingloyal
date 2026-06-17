/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
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

  const tenants = await ds.query(
    "SELECT id, business_name, slug FROM tenants WHERE slug = 'jadefy-store'",
  );
  console.log('Tenant:', JSON.stringify(tenants));
  const tid: string = tenants[0]?.id as string;
  if (!tid) {
    console.log('NO TENANT FOUND');
    await ds.destroy();
    return;
  }

  const txnCount = await ds.query(
    'SELECT COUNT(*) as cnt FROM transactions WHERE tenant_id = $1',
    [tid],
  );
  console.log('Total transactions:', txnCount[0].cnt);

  const catTxns = await ds.query(
    'SELECT COUNT(*) as cnt FROM transactions WHERE tenant_id = $1 AND category_id IS NOT NULL',
    [tid],
  );
  console.log('Transactions with category:', catTxns[0].cnt);

  const cats = await ds.query(
    `SELECT pc.name, COUNT(*) as cnt
     FROM transactions t
     JOIN product_categories pc ON t.category_id = pc.id
     WHERE t.tenant_id = $1
     GROUP BY pc.name ORDER BY cnt DESC`,
    [tid],
  );
  console.log('Category breakdown:', JSON.stringify(cats));

  const dow = await ds.query(
    `SELECT EXTRACT(DOW FROM created_at) AS dow,
            TRIM(TO_CHAR(created_at, 'Day')) AS day_name,
            COUNT(*) AS cnt
     FROM transactions WHERE tenant_id = $1
     GROUP BY dow, day_name ORDER BY dow`,
    [tid],
  );
  console.log('DOW breakdown:', JSON.stringify(dow));

  const snap = await ds.query(
    'SELECT period_type, period_start, period_end, computed_at FROM report_snapshots WHERE tenant_id = $1',
    [tid],
  );
  console.log('Cached snapshots:', JSON.stringify(snap));

  await ds.destroy();
}

main().catch((e: unknown) => {
  console.error(String(e));
  process.exit(1);
});
