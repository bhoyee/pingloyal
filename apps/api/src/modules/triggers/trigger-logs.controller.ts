import { Controller, Get, Req } from '@nestjs/common';
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

  @Get()
  async findRecent(@Req() req: { user: RequestUser }) {
    const tenantId = req.user.tenantId;
    const rows = await this.dataSource.query<TriggerLogRow[]>(
      `SELECT tl.id, tl.trigger_type, tl.status, tl.skip_reason, tl.created_at,
              c.full_name AS customer_name
       FROM trigger_logs tl
       LEFT JOIN customers c ON tl.customer_id = c.id
       WHERE tl.tenant_id = $1
       ORDER BY tl.created_at DESC
       LIMIT 10`,
      [tenantId],
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
