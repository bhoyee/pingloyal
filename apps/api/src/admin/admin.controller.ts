import { Body, Controller, Post, NotFoundException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { BirthdayCronService } from '../modules/triggers/birthday-cron.service';
import { LapsedCronService } from '../modules/triggers/lapsed-cron.service';
import { QuarterlyResetCron } from '../modules/tenants/quarterly-reset.cron';
import { WaBotService } from '../modules/whatsapp/wa-bot.service';
import { TenantsService } from '../modules/tenants/tenants.service';
import { IntegrationSchedulerService } from '../modules/integrations/integration-scheduler.service';
import { BillingService } from '../modules/billing/billing.service';
import { WalletAlertCronService } from '../modules/billing/wallet-alert.cron';
import { ReportsCronService } from '../modules/reports/reports.cron';

@Public()
@Controller('admin/crons')
export class AdminController {
  constructor(
    private readonly birthdayCronService: BirthdayCronService,
    private readonly lapsedCronService: LapsedCronService,
    private readonly quarterlyResetCron: QuarterlyResetCron,
  ) {}

  @Post('birthday/trigger')
  async triggerBirthdayCron(): Promise<{ message: string; duration: number }> {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    const start = Date.now();
    await this.birthdayCronService.runBirthdayCron();
    return { message: 'Birthday cron triggered', duration: Date.now() - start };
  }

  @Post('quarterly-reset/trigger')
  async triggerQuarterlyReset(): Promise<{
    message: string;
    duration: number;
  }> {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    const start = Date.now();
    await this.quarterlyResetCron.runQuarterlyReset();
    return {
      message: 'Quarterly reset cron triggered',
      duration: Date.now() - start,
    };
  }

  @Post('lapsed/trigger')
  async triggerLapsedCron(): Promise<{ message: string; duration: number }> {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    const start = Date.now();
    await this.lapsedCronService.runLapsedCron();
    return { message: 'Lapsed cron triggered', duration: Date.now() - start };
  }
}

@Public()
@Controller('admin/crons')
export class AdminBillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('trial-check/trigger')
  async triggerTrialCheck(): Promise<{ message: string; duration: number }> {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    const start = Date.now();
    await this.billingService.checkExpiredTrials();
    return { message: 'Trial check triggered', duration: Date.now() - start };
  }
}

@Public()
@Controller('admin/crons')
export class AdminIntegrationController {
  constructor(
    private readonly scheduler: IntegrationSchedulerService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Post('integration-sync/trigger')
  async triggerIntegrationSync(
    @Body() body: { integrationId: string; tenantId: string },
  ): Promise<{ message: string }> {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    await this.scheduler.triggerOnce(body.integrationId, body.tenantId);
    return { message: 'Integration sync job queued' };
  }
}

@Public()
@Controller('admin/crons')
export class AdminWalletAlertController {
  constructor(
    private readonly walletAlertCronService: WalletAlertCronService,
  ) {}

  @Post('wallet-alert/trigger')
  async triggerWalletAlert(): Promise<{ message: string; duration: number }> {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    const start = Date.now();
    await this.walletAlertCronService.checkLowWalletBalances();
    return {
      message: 'Wallet alert cron triggered',
      duration: Date.now() - start,
    };
  }
}

@Public()
@Controller('admin/crons')
export class AdminReportsCronController {
  constructor(private readonly reportsCronService: ReportsCronService) {}

  @Post('reports-nightly/trigger')
  async triggerNightlyReports(): Promise<{
    message: string;
    duration: number;
  }> {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    const start = Date.now();
    await this.reportsCronService.preComputeAllReports();
    return {
      message: 'Nightly reports cron triggered',
      duration: Date.now() - start,
    };
  }

  @Post('reports-email/trigger')
  async triggerEmailReports(): Promise<{ message: string; duration: number }> {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    const start = Date.now();
    await this.reportsCronService.sendScheduledEmailReports();
    return {
      message: 'Scheduled email reports cron triggered',
      duration: Date.now() - start,
    };
  }
}

@Public()
@Controller('admin/simulate')
export class AdminSimulateController {
  constructor(
    private readonly waBotService: WaBotService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Post('inbound-message')
  async simulateInbound(
    @Body()
    body: {
      tenantId: string;
      senderPhone: string;
      messageText: string;
    },
  ): Promise<{ reply: string }> {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    const tenant = await this.tenantsService.findOne(body.tenantId);
    await this.waBotService.handleInbound({
      appId: tenant.gupshupAppId ?? '',
      senderPhone: body.senderPhone,
      messageText: body.messageText,
    });
    return { reply: 'Balance summary sent (simulated)' };
  }
}
