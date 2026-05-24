import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { parse } from 'csv-parse/sync';
import { v4 as uuidv4 } from 'uuid';
import { normalisePhone, PhoneNormalisationError } from '@pingloyal/utils';
import { CustomerSource, PointsLedgerReason } from '@pingloyal/types';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { Customer } from './entities/customer.entity';

export const IMPORT_PROCESS_EVENT = 'import.process';

const JOB_TTL_S = 86_400;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ROWS = 5_000;
const VALID_MIME_TYPES = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
];
const INSERT_CHUNK = 500;

export interface ImportJobStatus {
  status: 'pending' | 'processing' | 'done' | 'failed';
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; phone?: string; reason: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ImportProcessPayload {
  jobId: string;
  tenantId: string;
  buffer: Buffer;
}

interface ParsedRow {
  rowIndex: number;
  fullName: string;
  phoneE164: string;
  dateOfBirth: Date | null;
  pointsBalance: number;
  waOptedIn: boolean;
  externalId: string | null;
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly emitter: EventEmitter2,
  ) {}

  async startImport(
    tenantId: string,
    file: Express.Multer.File,
  ): Promise<{ jobId: string; status: string; message: string }> {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }
    if (!VALID_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type "${file.mimetype}". Upload a CSV file.`,
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File exceeds the 5 MB limit');
    }

    const jobId = uuidv4();
    const jobKey = `import:${tenantId}:${jobId}`;
    const now = new Date().toISOString();

    const initial: ImportJobStatus = {
      status: 'pending',
      total: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.redis.setex(jobKey, JOB_TTL_S, JSON.stringify(initial));

    const payload: ImportProcessPayload = { jobId, tenantId, buffer: file.buffer };
    this.emitter.emit(IMPORT_PROCESS_EVENT, payload);

    return { jobId, status: 'pending', message: 'Import started' };
  }

  async getJobStatus(tenantId: string, jobId: string): Promise<ImportJobStatus> {
    const raw = await this.redis.get(`import:${tenantId}:${jobId}`);
    if (!raw) {
      throw new NotFoundException(`Import job not found: ${jobId}`);
    }
    return JSON.parse(raw) as ImportJobStatus;
  }

  buildTemplate(): Buffer {
    const lines = [
      '# PingLoyal Customer Import Template',
      '# Required columns: full_name, phone',
      '# Optional columns: date_of_birth (YYYY-MM-DD), points_balance (integer ≥ 0), wa_opted_in (true/false), external_id',
      '# Maximum 5,000 rows per file. Phone numbers default to Nigerian format.',
      'full_name,phone,date_of_birth,points_balance,wa_opted_in,external_id',
      'Ada Okonkwo,08012345678,1990-05-15,100,true,EXT001',
      'Bola Adeyemi,07011111111,,0,false,',
    ];
    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  async processImport(payload: ImportProcessPayload): Promise<void> {
    const { jobId, tenantId, buffer } = payload;
    const jobKey = `import:${tenantId}:${jobId}`;

    const updateJob = async (patch: Partial<ImportJobStatus>): Promise<void> => {
      const existing = await this.redis.get(jobKey);
      const current: ImportJobStatus = existing
        ? (JSON.parse(existing) as ImportJobStatus)
        : {
            status: 'pending',
            total: 0,
            inserted: 0,
            updated: 0,
            skipped: 0,
            errors: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
      const merged = { ...current, ...patch, updatedAt: new Date().toISOString() };
      await this.redis.setex(jobKey, JOB_TTL_S, JSON.stringify(merged));
    };

    try {
      await updateJob({ status: 'processing' });

      // ── 1. Parse CSV ──────────────────────────────────────────────────────────
      let rawRows: Record<string, string>[];
      try {
        rawRows = parse(buffer, {
          columns: (header: string[]) =>
            header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_')),
          skip_empty_lines: true,
          trim: true,
          comment: '#',
          bom: true,
        }) as Record<string, string>[];
      } catch (e) {
        await updateJob({
          status: 'failed',
          errors: [{ row: 0, reason: `CSV parse error: ${String(e)}` }],
        });
        return;
      }

      if (rawRows.length > MAX_ROWS) {
        await updateJob({
          status: 'failed',
          errors: [
            {
              row: 0,
              reason: `File contains ${rawRows.length} data rows; maximum allowed is ${MAX_ROWS}`,
            },
          ],
        });
        return;
      }

      // ── 2. Validate and normalise each row ────────────────────────────────────
      const validRows: ParsedRow[] = [];
      const errors: ImportJobStatus['errors'] = [];

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const rowNum = i + 2; // header is row 1, data starts at row 2

        const fullName = row['full_name']?.trim();
        if (!fullName) {
          errors.push({ row: rowNum, reason: 'full_name is required' });
          continue;
        }

        const rawPhone = row['phone']?.trim();
        if (!rawPhone) {
          errors.push({ row: rowNum, reason: 'phone is required' });
          continue;
        }

        let phoneE164: string;
        try {
          phoneE164 = normalisePhone(rawPhone);
        } catch (e) {
          errors.push({
            row: rowNum,
            phone: rawPhone,
            reason:
              e instanceof PhoneNormalisationError ? e.message : 'Invalid phone number',
          });
          continue;
        }

        const pointsRaw = row['points_balance']?.trim();
        const pointsBalance = pointsRaw ? parseInt(pointsRaw, 10) : 0;
        if (Number.isNaN(pointsBalance) || pointsBalance < 0) {
          errors.push({
            row: rowNum,
            phone: rawPhone,
            reason: 'points_balance must be a non-negative integer',
          });
          continue;
        }

        const dobRaw = row['date_of_birth']?.trim();
        let dateOfBirth: Date | null = null;
        if (dobRaw) {
          const d = new Date(dobRaw);
          if (Number.isNaN(d.getTime())) {
            errors.push({
              row: rowNum,
              phone: rawPhone,
              reason: `Invalid date_of_birth: "${dobRaw}"`,
            });
            continue;
          }
          dateOfBirth = d;
        }

        const waRaw = row['wa_opted_in']?.trim().toLowerCase();
        const waOptedIn = waRaw === 'true' || waRaw === 'yes' || waRaw === '1';
        const externalId = row['external_id']?.trim() || null;

        validRows.push({
          rowIndex: rowNum,
          fullName,
          phoneE164,
          dateOfBirth,
          pointsBalance,
          waOptedIn,
          externalId,
        });
      }

      // ── 3. Deduplicate within CSV (first occurrence wins) ─────────────────────
      const seenPhones = new Set<string>();
      const dedupedRows: ParsedRow[] = [];
      for (const row of validRows) {
        if (seenPhones.has(row.phoneE164)) {
          errors.push({
            row: row.rowIndex,
            phone: row.phoneE164,
            reason: 'Duplicate phone number in file — first occurrence kept',
          });
        } else {
          seenPhones.add(row.phoneE164);
          dedupedRows.push(row);
        }
      }

      // ── 4. Pre-check existing customers ──────────────────────────────────────
      const allPhones = dedupedRows.map((r) => r.phoneE164);
      let existingPhoneSet = new Set<string>();
      if (allPhones.length > 0) {
        const existing = await this.customerRepo.find({
          where: { tenantId, phoneE164: In(allPhones) },
          select: ['phoneE164'],
        });
        existingPhoneSet = new Set(existing.map((c) => c.phoneE164));
      }

      const toInsert = dedupedRows.filter((r) => !existingPhoneSet.has(r.phoneE164));
      const toUpdate = dedupedRows.filter((r) => existingPhoneSet.has(r.phoneE164));

      // Pre-generate IDs for new customers so we can reference them for ledger seeding
      const newCustomerData = toInsert.map((r) => ({
        id: uuidv4(),
        tenantId,
        fullName: r.fullName,
        phoneE164: r.phoneE164,
        dateOfBirth: r.dateOfBirth ?? null,
        pointsBalance: r.pointsBalance,
        waOptedIn: r.waOptedIn,
        waOptedInAt: r.waOptedIn ? new Date() : null,
        source: CustomerSource.CSV_IMPORT,
        externalId: r.externalId,
        isActive: true,
      }));

      // ── 5. Execute upsert + ledger seeding in a transaction ──────────────────
      await this.dataSource.transaction(async (em) => {
        // 5a. Batch insert new customers
        for (let i = 0; i < newCustomerData.length; i += INSERT_CHUNK) {
          const chunk = newCustomerData.slice(i, i + INSERT_CHUNK);
          await em
            .createQueryBuilder()
            .insert()
            .into(Customer)
            .values(chunk)
            .execute();
        }

        // 5b. Batch update existing customers — name, dob, externalId only;
        //     never overwrite waOptedIn, pointsBalance, or source
        if (toUpdate.length > 0) {
          const phones = toUpdate.map((r) => r.phoneE164);
          const names = toUpdate.map((r) => r.fullName);
          const dobs = toUpdate.map((r) =>
            r.dateOfBirth ? r.dateOfBirth.toISOString().split('T')[0] : null,
          );
          const extIds = toUpdate.map((r) => r.externalId);

          await em.query(
            `UPDATE customers
               SET full_name    = data.full_name,
                   date_of_birth = COALESCE(data.dob::date, customers.date_of_birth),
                   external_id  = COALESCE(data.ext_id, customers.external_id),
                   updated_at   = NOW()
             FROM (
               SELECT
                 unnest($1::text[]) AS phone_e164,
                 unnest($2::text[]) AS full_name,
                 unnest($3::text[]) AS dob,
                 unnest($4::text[]) AS ext_id
             ) AS data
             WHERE customers.tenant_id  = $5
               AND customers.phone_e164 = data.phone_e164`,
            [phones, names, dobs, extIds, tenantId],
          );
        }

        // 5c. Seed ledger for newly inserted customers that carry initial points
        const toSeed = newCustomerData.filter((d) => d.pointsBalance > 0);
        for (const cust of toSeed) {
          await em.query(
            `INSERT INTO points_ledger
               (id, tenant_id, customer_id, delta, reason, balance_after, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [
              uuidv4(),
              tenantId,
              cust.id,
              cust.pointsBalance,
              PointsLedgerReason.IMPORT_SEED,
              cust.pointsBalance,
            ],
          );
        }

        // 5d. Tier assignment for newly inserted customers (lowest tier by quarterly spend)
        if (newCustomerData.length > 0) {
          const tiers: Array<{ id: string }> = await em.query(
            `SELECT id FROM tier_configs
              WHERE tenant_id = $1
              ORDER BY min_quarterly_spend ASC
              LIMIT 1`,
            [tenantId],
          );
          if (tiers.length > 0) {
            const insertedIds = newCustomerData.map((d) => d.id);
            await em.query(
              `UPDATE customers SET tier_id = $1 WHERE id = ANY($2::uuid[])`,
              [tiers[0].id, insertedIds],
            );
          }
        }
      });

      await updateJob({
        status: 'done',
        total: rawRows.length,
        inserted: toInsert.length,
        updated: toUpdate.length,
        skipped: errors.length,
        errors,
      });

      this.logger.log(
        `[IMPORT] job=${jobId} tenant=${tenantId} ` +
          `inserted=${toInsert.length} updated=${toUpdate.length} skipped=${errors.length}`,
      );
    } catch (err) {
      this.logger.error(`[IMPORT] job=${jobId} failed: ${String(err)}`);
      await updateJob({
        status: 'failed',
        errors: [{ row: 0, reason: String(err) }],
      });
    }
  }
}
