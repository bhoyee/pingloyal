import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TemplateRequest, TemplateRequestStatus } from './entities/template-request.entity';
import { CreateTemplateRequestDto } from './dto/create-template-request.dto';
import { MailerService } from '../../common/mailer/mailer.service';

@Injectable()
export class TemplateRequestsService {
  private readonly logger = new Logger(TemplateRequestsService.name);

  constructor(
    @InjectRepository(TemplateRequest)
    private readonly repo: Repository<TemplateRequest>,
    private readonly mailer: MailerService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(
    tenantId: string,
    businessName: string,
    dto: CreateTemplateRequestDto,
  ): Promise<TemplateRequest> {
    const request = await this.repo.save(
      this.repo.create({ tenantId, name: dto.name, useCase: dto.useCase }),
    );

    // Fire-and-forget — never fail the request if email fails
    this.mailer
      .sendTemplateRequestNotification({
        tenantId,
        businessName,
        templateName: dto.name,
        useCase: dto.useCase,
        requestId: request.id,
      })
      .catch((err: unknown) =>
        this.logger.error(
          `Failed to send template request notification for tenant ${tenantId}`,
          err,
        ),
      );

    return request;
  }

  findAll(tenantId: string): Promise<TemplateRequest[]> {
    return this.repo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findAllForStaff(query: { status?: string; page: number }) {
    const limit = 25;
    const offset = (query.page - 1) * limit;
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (query.status) {
      params.push(query.status);
      conditions.push(`tr.status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows: { count: string }[] = await this.dataSource.query(
      `SELECT COUNT(*) AS count FROM template_requests tr ${where}`,
      params,
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const dataParams = [...params, limit, offset];
    type Row = {
      id: string; name: string; use_case: string; status: string;
      created_at: string; updated_at: string;
      tenant_id: string; business_name: string;
    };
    const rows: Row[] = await this.dataSource.query(
      `SELECT tr.id, tr.name, tr.use_case, tr.status, tr.created_at, tr.updated_at,
              tr.tenant_id, t.business_name
       FROM template_requests tr
       JOIN tenants t ON t.id = tr.tenant_id
       ${where}
       ORDER BY tr.created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams,
    );

    return {
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        useCase: r.use_case,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        tenantId: r.tenant_id,
        businessName: r.business_name,
      })),
      total,
      page: query.page,
      limit,
    };
  }

  async getCountsForStaff(): Promise<{ pending: number; in_progress: number }> {
    const rows = await this.dataSource.query<{ status: string; cnt: string }[]>(
      `SELECT status, COUNT(*)::int AS cnt FROM template_requests GROUP BY status`,
    );
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.status] = Number(r.cnt);
    return { pending: counts['pending'] ?? 0, in_progress: counts['in_progress'] ?? 0 };
  }

  async updateStatusForStaff(id: string, status: TemplateRequestStatus) {
    const req = await this.repo.findOne({ where: { id } });
    if (!req) throw new NotFoundException('Template request not found');
    await this.repo.update(id, { status });
    return { ...req, status };
  }
}
