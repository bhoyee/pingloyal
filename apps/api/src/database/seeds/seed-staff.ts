/**
 * One-off bootstrap script for the very first PingLoyal staff account —
 * intentionally NOT a migration (a real password hash should never be
 * committed to git history).
 *
 * Re-runnable: upserts by email, so re-running with a new password just
 * rotates it.
 *
 * Run with:
 *   STAFF_EMAIL=you@pingloyal.com STAFF_PASSWORD=... \
 *     npx ts-node -r tsconfig-paths/register src/database/seeds/seed-staff.ts
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';

dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../../../../.env') });

const BCRYPT_ROUNDS = 12;

async function main() {
  const email = process.env.STAFF_EMAIL;
  const password = process.env.STAFF_PASSWORD;
  const fullName = process.env.STAFF_FULL_NAME ?? 'PingLoyal Support';
  // This script seeds the very first account, so it defaults to the most
  // privileged role — every account created afterward goes through the
  // staff management API instead, which always takes an explicit role.
  const role = process.env.STAFF_ROLE ?? 'super_admin';

  if (!email || !password) {
    console.error(
      'Usage: STAFF_EMAIL=... STAFF_PASSWORD=... [STAFF_FULL_NAME=...] npm run seed:staff',
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('STAFF_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required.');
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
  });
  await dataSource.initialize();

  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const normalizedEmail = email.toLowerCase().trim();

  await dataSource.query(
    `INSERT INTO "staff" ("email", "hashed_password", "full_name", "role")
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ("email")
     DO UPDATE SET "hashed_password" = EXCLUDED."hashed_password", "full_name" = EXCLUDED."full_name", "role" = EXCLUDED."role"`,
    [normalizedEmail, hashedPassword, fullName, role],
  );

  console.log(`Staff account ready: ${normalizedEmail} (${role})`);
  await dataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
