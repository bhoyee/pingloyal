import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  WaTemplatesService,
  TEMPLATE_DEFAULTS,
  TEMPLATABLE_TRIGGER_TYPES,
} from '../../src/modules/triggers/wa-templates.service';
import { WaTriggerTemplate } from '../../src/modules/triggers/entities/wa-trigger-template.entity';
import { TriggerType } from '@pingloyal/types';

const TENANT_ID = 'tenant-abc';

function makeCustom(triggerType: string, body: string): WaTriggerTemplate {
  const t = new WaTriggerTemplate();
  t.id = 'tmpl-1';
  t.tenantId = TENANT_ID;
  t.triggerType = triggerType;
  t.body = body;
  t.createdAt = new Date('2024-01-01');
  t.updatedAt = new Date('2024-06-01');
  return t;
}

describe('WaTemplatesService', () => {
  let service: WaTemplatesService;
  let repo: {
    find: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      save: jest.fn(),
      create: jest.fn(
        (dto: Partial<WaTriggerTemplate>) => ({ ...dto }) as WaTriggerTemplate,
      ),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaTemplatesService,
        { provide: getRepositoryToken(WaTriggerTemplate), useValue: repo },
      ],
    }).compile();

    service = module.get<WaTemplatesService>(WaTemplatesService);
  });

  describe('findAll', () => {
    it('returns all 6 trigger types with defaults when no customs exist', async () => {
      repo.find.mockResolvedValue([]);
      const result = await service.findAll(TENANT_ID);
      expect(result).toHaveLength(6);
      expect(result.every((r) => !r.isCustom)).toBe(true);
      expect(result.every((r) => r.customBody === null)).toBe(true);
      expect(result.every((r) => r.activeBody === r.defaultBody)).toBe(true);
    });

    it('merges custom body when one exists', async () => {
      const custom = makeCustom(
        TriggerType.BIRTHDAY,
        'Happy bday {{firstName}}!',
      );
      repo.find.mockResolvedValue([custom]);
      const result = await service.findAll(TENANT_ID);
      const birthday = result.find(
        (r) => r.triggerType === (TriggerType.BIRTHDAY as string),
      )!;
      expect(birthday.isCustom).toBe(true);
      expect(birthday.customBody).toBe('Happy bday {{firstName}}!');
      expect(birthday.activeBody).toBe('Happy bday {{firstName}}!');
      // Other entries still use defaults
      const welcome = result.find(
        (r) => r.triggerType === (TriggerType.WELCOME as string),
      )!;
      expect(welcome.isCustom).toBe(false);
    });

    it('includes all required fields on each entry', async () => {
      repo.find.mockResolvedValue([]);
      const result = await service.findAll(TENANT_ID);
      for (const entry of result) {
        expect(entry).toMatchObject({
          triggerType: expect.any(String) as unknown,
          label: expect.any(String) as unknown,
          defaultBody: expect.any(String) as unknown,
          variables: expect.any(Array) as unknown,
        });
      }
    });
  });

  describe('findCustom', () => {
    it('returns the custom template when found', async () => {
      const custom = makeCustom(TriggerType.WELCOME, 'Hi {{firstName}}!');
      repo.findOne.mockResolvedValue(custom);
      const result = await service.findCustom(TENANT_ID, TriggerType.WELCOME);
      expect(result).toBe(custom);
    });

    it('returns null when no custom template', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.findCustom(TENANT_ID, TriggerType.WELCOME);
      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    it('creates a new custom template when none exists', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.save.mockResolvedValue(undefined);
      const body = 'Custom welcome for {{firstName}} at {{businessName}}!';
      const result = await service.upsert(TENANT_ID, TriggerType.WELCOME, body);
      expect(repo.save).toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
      expect(result.isCustom).toBe(true);
      expect(result.customBody).toBe(body);
      expect(result.activeBody).toBe(body);
    });

    it('updates existing custom template', async () => {
      const existing = makeCustom(TriggerType.WELCOME, 'old body');
      repo.findOne.mockResolvedValue(existing);
      repo.update.mockResolvedValue(undefined);
      const newBody = 'New custom welcome message for {{firstName}}!';
      const result = await service.upsert(
        TENANT_ID,
        TriggerType.WELCOME,
        newBody,
      );
      expect(repo.update).toHaveBeenCalledWith(existing.id, { body: newBody });
      expect(repo.save).not.toHaveBeenCalled();
      expect(result.customBody).toBe(newBody);
    });

    it('throws BadRequestException for unknown trigger type', async () => {
      await expect(
        service.upsert(TENANT_ID, 'invalid_type', 'some body'),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns correct label and variables from TEMPLATE_DEFAULTS', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.save.mockResolvedValue(undefined);
      const result = await service.upsert(
        TENANT_ID,
        TriggerType.BIRTHDAY,
        'Happy birthday {{firstName}}!',
      );
      expect(result.label).toBe(TEMPLATE_DEFAULTS[TriggerType.BIRTHDAY].label);
      expect(result.variables).toEqual(
        TEMPLATE_DEFAULTS[TriggerType.BIRTHDAY].variables,
      );
    });
  });

  describe('reset', () => {
    it('deletes custom template and returns default entry', async () => {
      repo.delete.mockResolvedValue(undefined);
      const result = await service.reset(TENANT_ID, TriggerType.LAPSED_WINBACK);
      expect(repo.delete).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        triggerType: TriggerType.LAPSED_WINBACK,
      });
      expect(result.isCustom).toBe(false);
      expect(result.customBody).toBeNull();
      expect(result.activeBody).toBe(
        TEMPLATE_DEFAULTS[TriggerType.LAPSED_WINBACK].body,
      );
    });

    it('throws NotFoundException for unknown trigger type', async () => {
      await expect(service.reset(TENANT_ID, 'bogus_type')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('TEMPLATABLE_TRIGGER_TYPES coverage', () => {
    it('has defaults for every templatable type', () => {
      for (const type of TEMPLATABLE_TRIGGER_TYPES) {
        expect(TEMPLATE_DEFAULTS[type]).toBeDefined();
        expect(TEMPLATE_DEFAULTS[type].body.length).toBeGreaterThan(10);
        expect(TEMPLATE_DEFAULTS[type].variables.length).toBeGreaterThan(0);
      }
    });
  });
});
