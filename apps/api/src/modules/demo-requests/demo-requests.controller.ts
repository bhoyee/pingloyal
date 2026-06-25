import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { DemoRequestThrottleGuard } from '../../common/throttle/demo-request-throttle.guard';
import { DemoRequestDto } from './dto/demo-request.dto';
import { DemoRequestsService } from './demo-requests.service';

@ApiTags('Demo Requests')
@Controller('demo-requests')
@Public()
export class DemoRequestsController {
  constructor(private readonly demoRequestsService: DemoRequestsService) {}

  @UseGuards(DemoRequestThrottleGuard)
  @Throttle({ demo_request: { ttl: 60_000, limit: 5 } })
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a "Book a demo" request' })
  submit(@Body() dto: DemoRequestDto) {
    return this.demoRequestsService.submit(dto);
  }
}
