import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { getDaysInMonth, startOfMonth, subMonths, endOfMonth } from 'date-fns';
import { UserRole } from '@pingloyal/types';
import type { RequestUser, ReportPeriod } from '@pingloyal/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';
import { ReportSchedule } from './entities/report-schedule.entity';
import { ReportQueryDto } from './dto/report-query.dto';
import { ScheduleReportDto } from './dto/schedule-report.dto';

@Controller('reports')
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);

  constructor(
    private readonly reportsService: ReportsService,
    @InjectRepository(ReportSchedule)
    private readonly scheduleRepo: Repository<ReportSchedule>,
  ) {}

  // ── Period builder ─────────────────────────────────────────────────────────

  private buildPeriod(query: ReportQueryDto): ReportPeriod {
    const now = new Date();
    let start: Date;
    let end: Date;
    let durationDays: number;

    switch (query.period) {
      case 'this_month':
        start = startOfMonth(now);
        end = now;
        durationDays = now.getDate();
        break;

      case 'last_month': {
        const lastMonth = subMonths(now, 1);
        start = startOfMonth(lastMonth);
        end = endOfMonth(lastMonth);
        durationDays = getDaysInMonth(lastMonth);
        break;
      }

      case 'last_3_months':
        start = startOfMonth(subMonths(now, 3));
        end = now;
        durationDays = 90;
        break;

      case 'last_6_months':
        start = startOfMonth(subMonths(now, 6));
        end = now;
        durationDays = 180;
        break;

      case 'custom': {
        if (!query.start || !query.end) {
          throw new BadRequestException(
            'start and end are required for custom period',
          );
        }
        start = new Date(query.start);
        end = new Date(query.end);
        if (start >= end) {
          throw new BadRequestException('start must be before end');
        }
        if (end > now) end = now;
        durationDays = Math.ceil(
          (end.getTime() - start.getTime()) / (24 * 3600 * 1000),
        );
        break;
      }

      default:
        start = startOfMonth(now);
        end = now;
        durationDays = now.getDate();
    }

    return { type: query.period, start, end, durationDays };
  }

  // ── GET /reports/summary ──────────────────────────────────────────────────

  @Get('summary')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getSummary(
    @Req() req: { user: RequestUser },
    @Query() query: ReportQueryDto,
  ) {
    const period = this.buildPeriod(query);
    return this.reportsService.getReport(req.user.tenantId, period);
  }

  // ── POST /reports/refresh ─────────────────────────────────────────────────

  @Post('refresh')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async refresh(
    @Req() req: { user: RequestUser },
    @Query() query: ReportQueryDto,
  ) {
    const period = this.buildPeriod(query);
    return this.reportsService.computeReport(req.user.tenantId, period);
  }

  // ── GET /reports/pdf ──────────────────────────────────────────────────────

  @Get('pdf')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async downloadPdf(
    @Req() req: { user: RequestUser },
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const period = this.buildPeriod(query);
    const [buffer, businessName] = await Promise.all([
      this.reportsService.generatePdf(req.user.tenantId, period),
      this.reportsService.getBusinessName(req.user.tenantId),
    ]);
    const slug = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const periodLabel = query.period.replace(/_/g, '-');
    const filename = `${slug}-report-${periodLabel}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  // ── GET /reports/excel ────────────────────────────────────────────────────

  @Get('excel')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async downloadExcel(
    @Req() req: { user: RequestUser },
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const period = this.buildPeriod(query);
    const [buffer, businessName] = await Promise.all([
      this.reportsService.generateExcel(req.user.tenantId, period),
      this.reportsService.getBusinessName(req.user.tenantId),
    ]);
    const slug = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const periodLabel = query.period.replace(/_/g, '-');
    const filename = `${slug}-report-${periodLabel}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  // ── POST /reports/schedule ────────────────────────────────────────────────

  @Post('schedule')
  @Roles(UserRole.OWNER)
  async createSchedule(
    @Req() req: { user: RequestUser },
    @Body() dto: ScheduleReportDto,
  ) {
    const tenantId = req.user.tenantId;
    const existing = await this.scheduleRepo.findOne({ where: { tenantId } });

    if (existing) {
      await this.scheduleRepo.save(
        Object.assign(existing, {
          email: dto.email,
          frequency: dto.frequency,
          isActive: true,
        }),
      );
    } else {
      await this.scheduleRepo.save(
        this.scheduleRepo.create({
          tenantId,
          email: dto.email,
          frequency: dto.frequency,
          isActive: true,
        }),
      );
    }

    return { message: `Monthly report will be sent to ${dto.email}` };
  }

  // ── GET /reports/schedule ─────────────────────────────────────────────────

  @Get('schedule')
  @Roles(UserRole.OWNER)
  async getSchedule(@Req() req: { user: RequestUser }) {
    const schedule = await this.scheduleRepo.findOne({
      where: { tenantId: req.user.tenantId },
    });
    return schedule ?? null;
  }

  // ── DELETE /reports/schedule ──────────────────────────────────────────────

  @Delete('schedule')
  @Roles(UserRole.OWNER)
  async deleteSchedule(@Req() req: { user: RequestUser }) {
    await this.scheduleRepo.update(
      { tenantId: req.user.tenantId },
      { isActive: false },
    );
    return { message: 'Scheduled report cancelled' };
  }
}
