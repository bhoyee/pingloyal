/**
 * Standalone migration runner — compiled to dist/database/run-migrations.js
 *
 * Used by deploy.yml to apply pending migrations inside the Docker container:
 *   node dist/database/run-migrations.js
 *
 * Can also be called from the VPS without Docker via the npm migration:run script.
 */
import 'reflect-metadata';
import { AppDataSource } from './data-source';

AppDataSource.initialize()
  .then(async () => {
    console.log('[migrations] Connecting to database...');
    const pending = await AppDataSource.showMigrations();
    if (!pending) {
      console.log(
        '[migrations] All migrations already applied — nothing to run',
      );
      await AppDataSource.destroy();
      process.exit(0);
    }
    console.log('[migrations] Running pending migrations...');
    const results = await AppDataSource.runMigrations({ transaction: 'all' });
    console.log(`[migrations] Applied ${results.length} migration(s):`);
    results.forEach((m) => console.log(`  ✓ ${m.name}`));
    await AppDataSource.destroy();
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error('[migrations] FAILED:', err);
    process.exit(1);
  });
