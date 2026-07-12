import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import type Redis from 'ioredis';
import { PointsLedgerReason, TransactionSource } from '@pingloyal/types';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { TenantsService } from '../tenants/tenants.service';
import { TierService } from '../tenants/tier.service';
import { Customer } from '../customers/entities/customer.entity';
import { ProductCategory } from '../tenants/entities/product-category.entity';
import { Transaction } from './entities/transaction.entity';
import { PointsLedger } from './entities/points-ledger.entity';
import type { CreateTransactionDto } from './dto/create-transaction.dto';

// ── Pure calculation helpers (exported for direct unit testing) ───────────────

export function calculatePointsEarned(
  amount: string,
  earnRate: number,
): number {
  return Math.floor(parseFloat(amount) / earnRate);
}

export function isPointsOverIssued(
  pointsEarned: number,
  amount: string,
  earnRate: number,
): boolean {
  return pointsEarned > Math.floor(parseFloat(amount) / earnRate);
}

// ── Response shape ─────────────────────────────────────────────────────────────

export interface TransactionResult {
  id: string;
  amount: string;
  pointsEarned: number;
  alreadyProcessed: boolean;
  customer: {
    id: string;
    fullName: string;
    pointsBalance: number;
    progressPercent: number;
    tier: string | null;
  };
  createdAt: string;
}

// Manually mapped row — never return the raw Transaction entity here, since
// its loggedByUser relation pulls in the full User row (incl. hashedPassword).
export interface TransactionLogRow {
  id: string;
  amount: string;
  pointsEarned: number;
  source: TransactionSource;
  createdAt: string;
  customer: { id: string; fullName: string } | null;
  categoryName: string | null;
  cashierName: string | null;
  isFlagged: boolean;
  flagReason: string | null;
  voidedAt: string | null;
}

export interface TransactionListResult {
  data: TransactionLogRow[];
  total: number;
  page: number;
  limit: number;
  // Aggregated across every row matching the filters, not just the current
  // page — the transaction log's summary bar needs period-wide totals.
  totalAmount: string;
  totalPoints: number;
}

// Manually mapped row — never return the raw Transaction entity here, since
// its loggedByUser relation pulls in the full User row (incl. hashedPassword).
export interface CustomerTransactionRow {
  id: string;
  amount: string;
  pointsEarned: number;
  source: TransactionSource;
  createdAt: string;
  categoryName: string | null;
  cashierName: string | null;
}

export interface CustomerTransactionListResult {
  data: CustomerTransactionRow[];
  total: number;
  page: number;
  limit: number;
}

export interface ListTransactionsQuery {
  page?: number;
  limit?: number;
  customerId?: string;
  categoryId?: string;
  cashierId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepo: Repository<ProductCategory>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
    private readonly tierService: TierService,
    @InjectQueue('wa-messages') private readonly waMessagesQueue: Queue,
    @InjectQueue('trigger-check') private readonly triggerCheckQueue: Queue,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ── POST /transactions ──────────────────────────────────────────────────────

  async create(
    tenantId: string,
    userId: string | null,
    dto: CreateTransactionDto,
    source: TransactionSource = TransactionSource.CASHIER_APP,
  ): Promise<TransactionResult> {
    // Step 1 — Idempotency check (before any other DB query)
    const existing = await this.txRepo.findOne({
      where: { idempotencyKey: dto.idempotencyKey, tenantId },
      relations: ['customer', 'customer.tier'],
    });

    // Tenant config needed for earnRate (step 3) and threshold (response)
    const tenant = await this.tenantsService.findOne(tenantId);

    if (existing) {
      return this.buildResult(existing, tenant.pointsThreshold, true);
    }

    // Step 2 — Validate amount value (format already checked by DTO)
    const amountNumber = parseFloat(dto.amount);
    if (isNaN(amountNumber) || amountNumber <= 0) {
      throw new BadRequestException('amount must be greater than 0');
    }
    const decimalPart = dto.amount.split('.')[1];
    if (decimalPart && decimalPart.length > 2) {
      throw new BadRequestException(
        'amount must have at most 2 decimal places',
      );
    }

    // Step 2a — Load customer (scoped to tenant, must be active)
    const customer = await this.customerRepo.findOne({
      where: { id: dto.customerId, tenantId, isActive: true },
      relations: ['tier'],
    });
    if (!customer) throw new NotFoundException('Customer not found');

    // Step 2c — Validate category if provided
    if (dto.categoryId) {
      const category = await this.categoryRepo.findOne({
        where: { id: dto.categoryId, tenantId, isActive: true },
      });
      if (!category) throw new NotFoundException('Category not found');
    }

    // Step 3 — Calculate points earned
    // earnRate is "currency units per point" (e.g. 100 = spend ₦100 to earn 1 point)
    const earnRate = Number(tenant.pointsEarnRate);
    const pointsEarned = calculatePointsEarned(dto.amount, earnRate);
    const newBalance = customer.pointsBalance + pointsEarned;

    // Auto-flag if points exceed what the earn rate formula would produce
    // (guards against future manual-override features or misconfigured earnRate)
    const isFlagged = isPointsOverIssued(pointsEarned, dto.amount, earnRate);
    const flagReason = isFlagged
      ? `Auto-flagged: ${pointsEarned} pts issued, expected ${Math.floor(parseFloat(dto.amount) / earnRate)} pts for ₦${dto.amount} at ₦${earnRate}/pt`
      : null;

    // Pre-generate ID so ledger can reference it before we query back
    const transactionId = uuidv4();

    // When the purchase actually happened — connected-mode integrations pass
    // this for delayed/batched events so the record reflects real purchase
    // time, not whenever we got around to processing it. Falls back to now
    // if absent or unparseable (e.g. a malformed value from a flaky POS).
    let occurredAt = new Date();
    if (dto.occurredAt) {
      const parsed = new Date(dto.occurredAt);
      if (!isNaN(parsed.getTime())) {
        occurredAt = parsed;
      } else {
        this.logger.warn(
          `Invalid occurredAt "${dto.occurredAt}" for tenant ${tenantId} — using current time`,
        );
      }
    }

    // Step 4 — All DB writes in a single atomic transaction
    await this.dataSource.transaction(async (em) => {
      // 4a. Insert transaction record
      await em.query(
        `INSERT INTO transactions
           (id, tenant_id, customer_id, category_id, logged_by_user_id,
            amount, points_earned, points_balance_after,
            source, idempotency_key, notes, created_at,
            is_flagged, flag_reason)
         VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          transactionId,
          tenantId,
          dto.customerId,
          dto.categoryId ?? null,
          userId,
          dto.amount,
          pointsEarned,
          newBalance,
          source,
          dto.idempotencyKey,
          dto.notes ?? null,
          occurredAt,
          isFlagged,
          flagReason,
        ],
      );

      // 4b. Insert points ledger entry
      await em.query(
        `INSERT INTO points_ledger
           (id, tenant_id, customer_id, delta, reason,
            ref_transaction_id, balance_after, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          uuidv4(),
          tenantId,
          dto.customerId,
          pointsEarned,
          PointsLedgerReason.PURCHASE,
          transactionId,
          newBalance,
          occurredAt,
        ],
      );

      // 4c. Atomic customer update — never read-then-write to avoid races.
      // last_purchase_at uses GREATEST so a delayed/batched event with an
      // older occurredAt can never regress it behind a more recent purchase
      // that's already been recorded.
      await em.query(
        `UPDATE customers SET
           points_balance   = points_balance   + $1,
           lifetime_points  = lifetime_points  + $1,
           total_spend      = total_spend      + $2::numeric,
           quarterly_spend  = quarterly_spend  + $2::numeric,
           purchase_count   = purchase_count   + 1,
           last_purchase_at = GREATEST(last_purchase_at, $5),
           updated_at       = NOW()
         WHERE id = $3 AND tenant_id = $4`,
        [pointsEarned, dto.amount, dto.customerId, tenantId, occurredAt],
      );

      // 4d. Tier recalculation (inside the same transaction)
      const newQuarterlySpend = Number(customer.quarterlySpend) + amountNumber;
      await this.tierService.recalculate(
        tenantId,
        dto.customerId,
        newQuarterlySpend,
        em,
      );
    });

    // Reload the committed row to get accurate customer state for the response
    const savedTx = await this.txRepo.findOneOrFail({
      where: { id: transactionId },
      relations: ['customer', 'customer.tier'],
    });

    // Step 5 — Fire-and-forget queue jobs (OUTSIDE the DB transaction).
    // Do NOT await — a failed enqueue must never fail the HTTP response
    // after a committed transaction.

    this.triggerCheckQueue
      .add(
        'check-triggers',
        { tenantId, customerId: dto.customerId, transactionId },
        { attempts: 2, backoff: { type: 'fixed', delay: 2000 } },
      )
      .catch((err: unknown) =>
        this.logger.error(`Failed to enqueue check-triggers: ${String(err)}`),
      );

    this.waMessagesQueue
      .add(
        'send-message',
        {
          type: 'purchase_confirmation',
          tenantId,
          customerId: dto.customerId,
          data: {
            pointsEarned: pointsEarned.toString(),
            newBalance: newBalance.toString(),
            threshold: String(tenant.pointsThreshold),
            rewardValue: String(tenant.rewardValue),
          },
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      )
      .catch((err: unknown) =>
        this.logger.error(`Failed to enqueue send-message: ${String(err)}`),
      );

    void this.redis
      .del(
        `dashboard:summary:${tenantId}`,
        `dashboard:top-spenders:${tenantId}`,
      )
      .catch(() => null);

    return this.buildResult(savedTx, tenant.pointsThreshold, false);
  }

  // ── GET /transactions ───────────────────────────────────────────────────────

  async findAll(
    tenantId: string,
    query: ListTransactionsQuery,
  ): Promise<TransactionListResult> {
    const page = query.page ?? 1;
    // Capped generously (not just the usual 100) so the transaction log's
    // "export CSV" action — which calls this same endpoint with a high
    // limit instead of a separate export endpoint — can pull a full
    // tenant's worth of rows for a bounded date range in one request.
    const limit = Math.min(query.limit ?? 20, 10_000);

    // Shared filter set, reused for both the paginated page query and the
    // separate period-wide aggregate query below — built fresh each time
    // since TypeORM query builders mutate in place and don't clone safely
    // once .take()/.skip()/.orderBy() have been applied.
    const applyFilters = (
      builder: ReturnType<typeof this.txRepo.createQueryBuilder>,
    ) => {
      builder.where('tx.tenantId = :tenantId', { tenantId });
      if (query.customerId) {
        builder.andWhere('customer.id = :customerId', {
          customerId: query.customerId,
        });
      }
      if (query.categoryId) {
        builder.andWhere('category.id = :categoryId', {
          categoryId: query.categoryId,
        });
      }
      if (query.cashierId) {
        builder.andWhere('cashier.id = :cashierId', {
          cashierId: query.cashierId,
        });
      }
      if (query.search) {
        builder.andWhere('customer.fullName ILIKE :search', {
          search: `%${query.search}%`,
        });
      }
      if (query.startDate) {
        builder.andWhere('tx.createdAt >= :startDate', {
          startDate: new Date(query.startDate),
        });
      }
      if (query.endDate) {
        builder.andWhere('tx.createdAt <= :endDate', {
          endDate: new Date(query.endDate),
        });
      }
      return builder;
    };

    const qb = applyFilters(
      this.txRepo
        .createQueryBuilder('tx')
        .leftJoinAndSelect('tx.customer', 'customer')
        .leftJoinAndSelect('tx.category', 'category')
        .leftJoin('tx.loggedByUser', 'cashier')
        .addSelect(['cashier.id', 'cashier.fullName']),
    )
      .orderBy('tx.createdAt', 'DESC')
      .take(limit)
      .skip((page - 1) * limit);

    const aggregateQb = applyFilters(
      this.txRepo
        .createQueryBuilder('tx')
        .leftJoin('tx.customer', 'customer')
        .leftJoin('tx.category', 'category')
        .leftJoin('tx.loggedByUser', 'cashier'),
    )
      .select('COALESCE(SUM(tx.amount), 0)', 'totalAmount')
      .addSelect('COALESCE(SUM(tx.pointsEarned), 0)', 'totalPoints');

    const [[rows, total], aggregate] = await Promise.all([
      qb.getManyAndCount(),
      aggregateQb.getRawOne<{ totalAmount: string; totalPoints: string }>(),
    ]);

    return {
      data: rows.map((tx) => ({
        id: tx.id,
        amount: String(tx.amount),
        pointsEarned: tx.pointsEarned,
        source: tx.source,
        createdAt: tx.createdAt.toISOString(),
        customer: tx.customer
          ? { id: tx.customer.id, fullName: tx.customer.fullName }
          : null,
        categoryName: tx.category?.name ?? null,
        cashierName: tx.loggedByUser?.fullName ?? null,
        isFlagged: tx.isFlagged,
        flagReason: tx.flagReason,
        voidedAt: tx.voidedAt ? tx.voidedAt.toISOString() : null,
      })),
      total,
      page,
      limit,
      totalAmount: aggregate?.totalAmount ?? '0',
      totalPoints: Number(aggregate?.totalPoints ?? 0),
    };
  }

  // ── GET /transactions/:id ───────────────────────────────────────────────────

  async findById(tenantId: string, id: string): Promise<Transaction> {
    const tx = await this.txRepo.findOne({
      where: { id, tenantId },
      relations: ['customer', 'category'],
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  // ── GET /customers/:customerId/transactions ─────────────────────────────────

  async findByCustomer(
    tenantId: string,
    customerId: string,
    query: Pick<ListTransactionsQuery, 'page' | 'limit'>,
  ): Promise<CustomerTransactionListResult> {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId, tenantId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const [data, total] = await this.txRepo.findAndCount({
      where: { tenantId, customer: { id: customerId } as Customer },
      relations: ['category', 'loggedByUser'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return {
      data: data.map((tx) => ({
        id: tx.id,
        amount: String(tx.amount),
        pointsEarned: tx.pointsEarned,
        source: tx.source,
        createdAt: tx.createdAt.toISOString(),
        categoryName: tx.category?.name ?? null,
        cashierName: tx.loggedByUser?.fullName ?? null,
      })),
      total,
      page,
      limit,
    };
  }

  // ── POST /transactions/:id/void ─────────────────────────────────────────────

  async voidTransaction(
    tenantId: string,
    txId: string,
    voidedByUserId: string,
  ): Promise<void> {
    const [tx] = await this.dataSource.query<
      {
        id: string;
        customer_id: string;
        points_earned: string;
        voided_at: string | null;
      }[]
    >(
      `SELECT id, customer_id, points_earned, voided_at
       FROM transactions WHERE id = $1 AND tenant_id = $2`,
      [txId, tenantId],
    );

    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.voided_at)
      throw new BadRequestException('Transaction already voided');

    const pts = parseInt(tx.points_earned, 10);
    if (pts === 0)
      throw new BadRequestException(
        'Transaction has zero points — nothing to void',
      );

    await this.dataSource.transaction(async (em) => {
      // Mark transaction as voided and flagged
      await em.query(
        `UPDATE transactions
         SET voided_at         = NOW(),
             voided_by_user_id = $1,
             is_flagged        = true,
             flag_reason       = COALESCE(flag_reason, 'Voided by manager')
         WHERE id = $2`,
        [voidedByUserId, txId],
      );

      // Deduct from customer — balance CAN go negative (debt state blocks redemption)
      const [updated] = await em.query<{ points_balance: string }[]>(
        `UPDATE customers
         SET points_balance  = points_balance  - $1,
             lifetime_points = lifetime_points - $1,
             updated_at      = NOW()
         WHERE id = $2 AND tenant_id = $3
         RETURNING points_balance`,
        [pts, tx.customer_id, tenantId],
      );

      const balanceAfter = Number(updated?.points_balance ?? 0);

      // Compensating ledger entry
      await em.query(
        `INSERT INTO points_ledger
           (id, tenant_id, customer_id, delta, reason, ref_transaction_id, balance_after)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          uuidv4(),
          tenantId,
          tx.customer_id,
          -pts,
          PointsLedgerReason.VOID,
          txId,
          balanceAfter,
        ],
      );
    });

    void this.redis
      .del(
        `dashboard:summary:${tenantId}`,
        `dashboard:top-spenders:${tenantId}`,
      )
      .catch(() => null);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private buildResult(
    tx: Transaction,
    pointsThreshold: number,
    alreadyProcessed: boolean,
  ): TransactionResult {
    const balance = tx.pointsBalanceAfter;
    return {
      id: tx.id,
      amount: String(tx.amount),
      pointsEarned: tx.pointsEarned,
      alreadyProcessed,
      customer: {
        id: tx.customer.id,
        fullName: tx.customer.fullName,
        pointsBalance: balance,
        progressPercent: Math.round((balance / pointsThreshold) * 100),
        tier: tx.customer.tier?.tierLabel ?? null,
      },
      createdAt: tx.createdAt.toISOString(),
    };
  }
}

// Re-export PointsLedger so the module can register it
export { PointsLedger };
