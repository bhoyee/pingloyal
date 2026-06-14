import * as crypto from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WhatsappController } from '../../src/modules/whatsapp/whatsapp.controller';
import { WaOnboardingService } from '../../src/modules/whatsapp/wa-onboarding.service';
import { WaBotService } from '../../src/modules/whatsapp/wa-bot.service';
import { CampaignsService } from '../../src/modules/campaigns/campaigns.service';
import type { GupshupWebhookPayload } from '../../src/modules/whatsapp/wa-onboarding.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SECRET = 'test-secret';

function makePayload(
  overrides: Partial<GupshupWebhookPayload> = {},
): GupshupWebhookPayload {
  return {
    app: 'app-123',
    type: 'message',
    payload: {
      source: '+2348012345678',
      type: 'text',
      payload: { text: 'hello' },
    },
    ...overrides,
  };
}

function sign(body: string): string {
  return crypto
    .createHmac('sha256', SECRET)
    .update(Buffer.from(body))
    .digest('hex');
}

function makeReq(
  payload: GupshupWebhookPayload,
  opts: { withSig?: boolean } = {},
): {
  rawBody?: Buffer;
  body: GupshupWebhookPayload;
  headers: Record<string, string>;
} {
  const raw = Buffer.from(JSON.stringify(payload));
  return {
    rawBody: opts.withSig ? raw : undefined,
    body: payload,
    headers: opts.withSig
      ? { 'x-gupshup-signature': sign(JSON.stringify(payload)) }
      : {},
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('WhatsappController.gupshupWebhook', () => {
  let controller: WhatsappController;
  let mockOnboarding: { handleVerificationReply: jest.Mock };
  let mockBot: { handleInbound: jest.Mock };
  let mockConfig: { getOrThrow: jest.Mock };
  let mockCampaigns: { handleDeliveryStatusEvent: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockOnboarding = {
      handleVerificationReply: jest.fn().mockResolvedValue(undefined),
    };
    mockBot = { handleInbound: jest.fn().mockResolvedValue(undefined) };
    mockConfig = { getOrThrow: jest.fn().mockReturnValue(SECRET) };
    mockCampaigns = {
      handleDeliveryStatusEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        { provide: WaOnboardingService, useValue: mockOnboarding },
        { provide: WaBotService, useValue: mockBot },
        { provide: ConfigService, useValue: mockConfig },
        { provide: CampaignsService, useValue: mockCampaigns },
      ],
    }).compile();

    controller = module.get(WhatsappController);
  });

  // ── T16: Valid HMAC signature → handler proceeds ───────────────────────────

  it('T16 — valid HMAC signature allows handler to proceed', async () => {
    const payload = makePayload();
    const req = makeReq(payload, { withSig: true });

    await controller.gupshupWebhook(req);

    expect(mockBot.handleInbound).toHaveBeenCalledTimes(1);
  });

  // ── T17: Invalid HMAC signature → 401 ─────────────────────────────────────

  it('T17 — invalid HMAC signature throws UnauthorizedException (401)', async () => {
    const payload = makePayload();
    const raw = Buffer.from(JSON.stringify(payload));
    const req = {
      rawBody: raw,
      body: payload,
      headers: { 'x-gupshup-signature': 'bad-signature' },
    };

    await expect(controller.gupshupWebhook(req as never)).rejects.toThrow(
      'Invalid webhook signature',
    );
  });

  // ── T18: type='message-event' → 200, no handler ───────────────────────────

  it("T18 — type='message-event' returns 200 without calling bot or onboarding", async () => {
    const payload = makePayload({ type: 'message-event' });
    const req = makeReq(payload);

    const result = await controller.gupshupWebhook(req);

    expect(result).toEqual({ status: 'ok' });
    expect(mockBot.handleInbound).not.toHaveBeenCalled();
    expect(mockOnboarding.handleVerificationReply).not.toHaveBeenCalled();
  });

  // ── T19: payload.type='image' → 200, no handler ───────────────────────────

  it("T19 — media message (payload.type='image') returns 200 without handler", async () => {
    const payload: GupshupWebhookPayload = {
      app: 'app-123',
      type: 'message',
      payload: { source: '+2348012345678', type: 'image', payload: {} },
    };
    const req = makeReq(payload);

    const result = await controller.gupshupWebhook(req);

    expect(result).toEqual({ status: 'ok' });
    expect(mockBot.handleInbound).not.toHaveBeenCalled();
  });

  // ── T20: 'YES' message → WaOnboardingService, not bot ─────────────────────

  it("T20 — 'YES' message routed to WaOnboardingService not WaBotService", async () => {
    const payload = makePayload({
      payload: {
        source: '+2348012345678',
        type: 'text',
        payload: { text: 'YES' },
      },
    });
    const req = makeReq(payload);

    await controller.gupshupWebhook(req);

    expect(mockOnboarding.handleVerificationReply).toHaveBeenCalledTimes(1);
    expect(mockBot.handleInbound).not.toHaveBeenCalled();
  });

  // ── T21: Non-YES text → WaBotService, not onboarding ─────────────────────

  it('T21 — non-YES text message routed to WaBotService not WaOnboardingService', async () => {
    const payload = makePayload({
      payload: {
        source: '+2348012345678',
        type: 'text',
        payload: { text: 'my balance' },
      },
    });
    const req = makeReq(payload);

    await controller.gupshupWebhook(req);

    expect(mockBot.handleInbound).toHaveBeenCalledWith({
      appId: 'app-123',
      senderPhone: '+2348012345678',
      messageText: 'my balance',
    });
    expect(mockOnboarding.handleVerificationReply).not.toHaveBeenCalled();
  });

  // ── T22: 'delivered' message-event → CampaignsService.handleDeliveryStatusEvent ─

  it("T22 — message-event type='delivered' forwards waMessageId to CampaignsService", async () => {
    const payload = makePayload({
      type: 'message-event',
      payload: { id: 'wamid.abc123', type: 'delivered' },
    });
    const req = makeReq(payload);

    const result = await controller.gupshupWebhook(req);

    expect(result).toEqual({ status: 'ok' });
    expect(mockCampaigns.handleDeliveryStatusEvent).toHaveBeenCalledWith(
      'wamid.abc123',
      'delivered',
      undefined,
    );
    expect(mockBot.handleInbound).not.toHaveBeenCalled();
  });

  // ── T23: 'failed' message-event with reason → forwarded to CampaignsService ───

  it("T23 — message-event type='failed' forwards waMessageId and reason", async () => {
    const payload = makePayload({
      type: 'message-event',
      payload: {
        id: 'wamid.def456',
        type: 'failed',
        payload: { reason: 'invalid number', code: '470' },
      },
    });
    const req = makeReq(payload);

    await controller.gupshupWebhook(req);

    expect(mockCampaigns.handleDeliveryStatusEvent).toHaveBeenCalledWith(
      'wamid.def456',
      'failed',
      'invalid number',
    );
  });
});
