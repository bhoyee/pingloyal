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
import { ContactFormThrottleGuard } from '../../common/throttle/contact-throttle.guard';
import { ContactDto } from './dto/contact.dto';
import { ContactService } from './contact.service';

@ApiTags('Contact')
@Controller('contact')
@Public()
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @UseGuards(ContactFormThrottleGuard)
  @Throttle({ contact_form: { ttl: 60_000, limit: 5 } })
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit the public contact form' })
  submit(@Body() dto: ContactDto) {
    return this.contactService.submit(dto);
  }
}
