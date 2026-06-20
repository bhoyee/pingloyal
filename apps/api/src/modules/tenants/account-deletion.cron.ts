import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

interface DueTenant {
  id: string;
  business_name: string;
}

@Injectable()
export class AccountDeletionCronService {
  private readonly logger = new Logger(AccountDeletionCronService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Cron('0 * * * *')
  async purgeScheduledDeletions(): Promise<void> {
    const dueTenants: DueTenant[] = await this.dataSource.query(
      `SELECT id, business_name FROM tenants
       WHERE deletion_requested_at IS NOT NULL
         AND deletion_scheduled_at <= NOW()`,
    );

    if (dueTenants.length === 0) return;

    this.logger.log(
      `Account deletion cron: ${dueTenants.length} tenant(s) due for permanent deletion`,
    );

    for (const tenant of dueTenants) {
      try {
        await this.hardDeleteTenant(tenant.id);
        this.logger.log(
          `Tenant permanently deleted: id=${tenant.id} business=${tenant.business_name}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to delete tenant id=${tenant.id} business=${tenant.business_name}`,
          err,
        );
      }
    }
  }

  // A handful of high-volume log/ledger tables reference tenants without
  // ON DELETE CASCADE (to avoid Postgres walking huge tables on every
  // ordinary tenant update). They must be cleared manually, in FK-dependency
  // order, before the tenant row itself can be deleted — every other table
  // (customers, campaigns, subscriptions, etc.) cascades automatically.
  private async hardDeleteTenant(tenantId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query('DELETE FROM points_ledger WHERE tenant_id = $1', [
        tenantId,
      ]);
      await manager.query('DELETE FROM transactions WHERE tenant_id = $1', [
        tenantId,
      ]);
      await manager.query('DELETE FROM campaign_logs WHERE tenant_id = $1', [
        tenantId,
      ]);
      await manager.query('DELETE FROM trigger_logs WHERE tenant_id = $1', [
        tenantId,
      ]);
      await manager.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    });
  }
}
