import { Controller, Get, Query, Req } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '@pingloyal/types';
import type { RequestUser } from '@pingloyal/types';
import { Roles } from '../../common/decorators/roles.decorator';

interface TriggerLogRow {
  id: string;
  trigger_type: string;
  customer_name: string | null;
  status: string;
  skip_reason: string | null;
  created_at: string;
}

@Controller('trigger-logs')
@Roles(UserRole.OWNER, UserRole.MANAGER)
export class TriggerLogsController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get('count')
  async count(
    @Req() req: { user: RequestUser },
    @Query('customerId') customerId?: string,
  ) {
    const params: unknown[] = [req.user.tenantId];
    let customerFilter = '';
    if (customerId) {
      params.push(customerId);
      customerFilter = `AND customer_id = $${params.length}`;
    }
    const [{ count }] = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM trigger_logs WHERE tenant_id = $1 ${customerFilter}`,
      params,
    );
    return { count: parseInt(count, 10) };
  }

  @Get()
  async findRecent(
    @Req() req: { user: RequestUser },
    @Query('customerId') customerId?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = req.user.tenantId;
    const cappedLimit = Math.min(parseInt(limit ?? '10', 10) || 10, 100);

    const params: unknown[] = [tenantId];
    let customerFilter = '';
    if (customerId) {
      params.push(customerId);
      customerFilter = `AND tl.customer_id = $${params.length}`;
    }
    params.push(cappedLimit);

    const rows = await this.dataSource.query<TriggerLogRow[]>(
      `SELECT tl.id, tl.trigger_type, tl.status, tl.skip_reason, tl.created_at,
              c.full_name AS customer_name
       FROM trigger_logs tl
       LEFT JOIN customers c ON tl.customer_id = c.id
       WHERE tl.tenant_id = $1 ${customerFilter}
       ORDER BY tl.created_at DESC
       LIMIT $${params.length}`,
      params,
    );

    return rows.map((r) => ({
      id: r.id,
      triggerType: r.trigger_type,
      customerName: r.customer_name,
      status: r.status,
      skipReason: r.skip_reason,
      createdAt: r.created_at,
    }));
  }
}
