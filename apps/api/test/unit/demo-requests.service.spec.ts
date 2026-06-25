import { DemoRequestsService } from '../../src/modules/demo-requests/demo-requests.service';
import { MailerService } from '../../src/common/mailer/mailer.service';

const mockMailer = {
  sendDemoRequestNotification: jest.fn(),
};

describe('DemoRequestsService', () => {
  let service: DemoRequestsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DemoRequestsService(mockMailer as unknown as MailerService);
  });

  it('sends a demo request notification email and returns a confirmation message', async () => {
    mockMailer.sendDemoRequestNotification.mockResolvedValue(undefined);

    const result = await service.submit({
      fullName: 'Ada Okafor',
      email: 'ada@example.com',
      companyName: 'Ada Stores Ltd',
    });

    expect(mockMailer.sendDemoRequestNotification).toHaveBeenCalledWith({
      fullName: 'Ada Okafor',
      email: 'ada@example.com',
      companyName: 'Ada Stores Ltd',
    });
    expect(result).toEqual({
      message: "Thanks! We'll reach out shortly to schedule your demo.",
    });
  });

  it('silently no-ops when the honeypot field is filled in', async () => {
    const result = await service.submit({
      fullName: 'Bot',
      email: 'bot@example.com',
      companyName: 'Spam Inc',
      website: 'http://spam.example.com',
    });

    expect(mockMailer.sendDemoRequestNotification).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: "Thanks! We'll reach out shortly to schedule your demo.",
    });
  });

  it('propagates a mailer failure instead of returning a false success message', async () => {
    mockMailer.sendDemoRequestNotification.mockRejectedValue(
      new Error('email down'),
    );

    await expect(
      service.submit({
        fullName: 'Ada Okafor',
        email: 'ada@example.com',
        companyName: 'Ada Stores Ltd',
      }),
    ).rejects.toThrow('email down');
  });
});
