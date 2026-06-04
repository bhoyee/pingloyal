import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { Repository, In } from 'typeorm';
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  getDaysInMonth,
  format,
} from 'date-fns';
import { SubscriptionStatus } from '@pingloyal/types';
import { ReportsService } from './reports.service';
import { EmailService } from './email.service';
import { ReportSchedule } from './entities/report-schedule.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import type { ReportPeriod } from '@pingloyal/types';

// Simple chunk helper to avoid lodash dependency
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

@Injectable()
export class ReportsCronService {
  private readonly logger = new Logger(ReportsCronService.name);

  constructor(
    private readonly reportsService: ReportsService,
    private readonly emailService: EmailService,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(ReportSchedule)
    private readonly scheduleRepo: Repository<ReportSchedule>,
  ) {}

  // ── Nightly pre-computation (2am UTC) ─────────────────────────────────────

  @Cron('0 2 * * *')
  async preComputeAllReports(): Promise<void> {
    const startTime = Date.now();
    const now = new Date();

    const activeTenants = await this.tenantRepo.find({
      where: {
        subscriptionStatus: In([
          SubscriptionStatus.ACTIVE,
          SubscriptionStatus.TRIALING,
          SubscriptionStatus.PAST_DUE,
        ]),
      },
      select: ['id'],
    });

    const batches = chunk(activeTenants, 10);
    let succeeded = 0;
    let failed = 0;

    const thisPeriod: ReportPeriod = {
      type: 'this_month',
      start: startOfMonth(now),
      end: now,
      durationDays: now.getDate(),
    };

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (tenant) => {
          try {
            await this.reportsService.computeReport(tenant.id, thisPeriod);
            succeeded++;
          } catch (err) {
            failed++;
            this.logger.error(
              `Nightly report failed for tenant ${tenant.id}`,
              err,
            );
          }
        }),
      );
    }

    const duration = Date.now() - startTime;
    this.logger.log(
      `Nightly reports complete — ` +
        `total: ${activeTenants.length}, ` +
        `succeeded: ${succeeded}, failed: ${failed}, ` +
        `duration: ${duration}ms`,
    );
  }

  // ── Monthly email dispatch (1am UTC, 1st of month) ────────────────────────

  @Cron('0 1 1 * *')
  async sendScheduledEmailReports(): Promise<void> {
    const schedules = await this.scheduleRepo.find({
      where: { isActive: true },
    });

    const lastMonthDate = subMonths(new Date(), 1);
    const lastMonth: ReportPeriod = {
      type: 'last_month',
      start: startOfMonth(lastMonthDate),
      end: endOfMonth(lastMonthDate),
      durationDays: getDaysInMonth(lastMonthDate),
    };

    for (const schedule of schedules) {
      try {
        const pdfBuffer = await this.reportsService.generatePdf(
          schedule.tenantId,
          lastMonth,
        );

        const monthName = format(lastMonth.start, 'MMMM yyyy');
        const filenameMonth = monthName.toLowerCase().replace(' ', '-');

        await this.emailService.send({
          to: schedule.email,
          subject: `Your PingLoyal Report — ${monthName}`,
          html: `
            <h2>Your Monthly Loyalty Report</h2>
            <p>Hi, please find your PingLoyal loyalty programme
            report for ${monthName} attached.</p>
            <p>Log in to your dashboard for interactive charts
            and detailed breakdowns.</p>
          `,
          attachments: [
            {
              filename: `pingloyal-report-${filenameMonth}.pdf`,
              content: pdfBuffer,
            },
          ],
        });

        await this.scheduleRepo.update(schedule.id, {
          lastSentAt: new Date(),
        });

        this.logger.log(
          `Report email sent: tenant=${schedule.tenantId} to=${schedule.email}`,
        );
      } catch (err) {
        this.logger.error(
          `Report email failed for tenant ${schedule.tenantId}`,
          err,
        );
      }
    }
  }
}
