import { ContactService } from '../../src/modules/contact/contact.service';
import { MailerService } from '../../src/common/mailer/mailer.service';

const mockMailer = {
  sendContactFormNotification: jest.fn(),
};

describe('ContactService', () => {
  let service: ContactService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ContactService(mockMailer as unknown as MailerService);
  });

  it('sends a contact form notification email and returns a confirmation message', async () => {
    mockMailer.sendContactFormNotification.mockResolvedValue(undefined);

    const result = await service.submit({
      name: 'Ada Okafor',
      email: 'ada@example.com',
      subject: 'Question about pricing',
      message: 'Do you support multiple branches on one plan?',
    });

    expect(mockMailer.sendContactFormNotification).toHaveBeenCalledWith({
      name: 'Ada Okafor',
      email: 'ada@example.com',
      subject: 'Question about pricing',
      message: 'Do you support multiple branches on one plan?',
    });
    expect(result).toEqual({
      message: "Thanks for reaching out — we'll get back to you soon.",
    });
  });

  it('silently no-ops when the honeypot field is filled in', async () => {
    const result = await service.submit({
      name: 'Bot',
      email: 'bot@example.com',
      subject: 'Hi',
      message: 'This is an automated spam message of sufficient length.',
      website: 'http://spam.example.com',
    });

    expect(mockMailer.sendContactFormNotification).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: "Thanks for reaching out — we'll get back to you soon.",
    });
  });

  it('propagates a mailer failure instead of returning a false success message', async () => {
    mockMailer.sendContactFormNotification.mockRejectedValue(
      new Error('email down'),
    );

    await expect(
      service.submit({
        name: 'Ada Okafor',
        email: 'ada@example.com',
        subject: 'Question about pricing',
        message: 'Do you support multiple branches on one plan?',
      }),
    ).rejects.toThrow('email down');
  });
});
