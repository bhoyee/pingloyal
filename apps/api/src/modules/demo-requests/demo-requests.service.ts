import { Injectable } from '@nestjs/common';
import { MailerService } from '../../common/mailer/mailer.service';
import { DemoRequestDto } from './dto/demo-request.dto';

@Injectable()
export class DemoRequestsService {
  constructor(private readonly mailer: MailerService) {}

  async submit(dto: DemoRequestDto): Promise<{ message: string }> {
    const CONFIRMATION = {
      message: "Thanks! We'll reach out shortly to schedule your demo.",
    };

    // Honeypot hit — see ContactService.submit for the full rationale.
    if (dto.website) {
      return CONFIRMATION;
    }

    await this.mailer.sendDemoRequestNotification(dto);
    return CONFIRMATION;
  }
}
