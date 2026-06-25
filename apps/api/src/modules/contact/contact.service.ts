import { Injectable } from '@nestjs/common';
import { MailerService } from '../../common/mailer/mailer.service';
import { ContactDto } from './dto/contact.dto';

@Injectable()
export class ContactService {
  constructor(private readonly mailer: MailerService) {}

  // Unlike ticket-reply notifications (fire-and-forget, since the ticket is
  // already durably saved regardless of email outcome), the email here IS
  // the submission — there's nothing else persisted, so a send failure must
  // propagate rather than be swallowed into a false "thanks!" response.
  async submit(dto: ContactDto): Promise<{ message: string }> {
    await this.mailer.sendContactFormNotification(dto);
    return { message: "Thanks for reaching out — we'll get back to you soon." };
  }
}
