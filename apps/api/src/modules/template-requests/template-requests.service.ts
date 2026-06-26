import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  findAllForStaff(
    status?: TemplateRequestStatus,
    tenantId?: string,
  ): Promise<TemplateRequest[]> {
    return this.repo.find({
      where: {
        ...(status ? { status } : {}),
        ...(tenantId ? { tenantId } : {}),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async updateStatusForStaff(
    requestId: string,
    status: TemplateRequestStatus,
  ): Promise<TemplateRequest> {
    const request = await this.repo.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Template request not found');

    await this.repo.update(requestId, { status });
    return { ...request, status };
  }
}
