import { Controller, Post, NotFoundException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { BirthdayCronService } from '../modules/triggers/birthday-cron.service';
import { QuarterlyResetCron } from '../modules/tenants/quarterly-reset.cron';

@Public()
@Controller('admin/crons')
export class AdminController {
  constructor(
    private readonly birthdayCronService: BirthdayCronService,
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
  triggerLapsedCron(): { message: string } {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    return { message: 'Lapsed cron not yet implemented' };
  }
}
