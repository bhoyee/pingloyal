import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import { PointsLedgerReason, TransactionSource } from '@pingloyal/types';
import { TenantsService } from '../tenants/tenants.service';
import { TierService } from '../tenants/tier.service';
import { Customer } from '../customers/entities/customer.entity';
import { ProductCategory } from '../tenants/entities/product-category.entity';
import { Transaction } from './entities/transaction.entity';
import { PointsLedger } from './entities/points-ledger.entity';
import type { CreateTransactionDto } from './dto/create-transaction.dto';

// ── Pure calculation helper (exported for direct unit testing) ────────────────

export function calculatePointsEarned(
  amount: string,
  earnRate: number,
): number {
  return Math.floor(parseFloat(amount) / earnRate);
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

export interface TransactionListResult {
  data: Transaction[];
  total: number;
  page: number;
  limit: number;
}

export interface ListTransactionsQuery {
  page?: number;
  limit?: number;
  customerId?: string;
  categoryId?: string;
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
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── POST /transactions ──────────────────────────────────────────────────────

  async create(
    tenantId: string,
    userId: string,
    dto: CreateTransactionDto,
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
    const pointsEarned = calculatePointsEarned(
      dto.amount,
      Number(tenant.pointsEarnRate),
    );
    const newBalance = customer.pointsBalance + pointsEarned;

    // Pre-generate ID so ledger can reference it before we query back
    const transactionId = uuidv4();

    // Step 4 — All DB writes in a single atomic transaction
    await this.dataSource.transaction(async (em) => {
      // 4a. Insert transaction record
      await em.query(
        `INSERT INTO transactions
           (id, tenant_id, customer_id, category_id, logged_by_user_id,
            amount, points_earned, points_balance_after,
            source, idempotency_key, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8, $9, $10, $11, NOW())`,
        [
          transactionId,
          tenantId,
          dto.customerId,
          dto.categoryId ?? null,
          userId,
          dto.amount,
          pointsEarned,
          newBalance,
          TransactionSource.CASHIER_APP,
          dto.idempotencyKey,
          dto.notes ?? null,
        ],
      );

      // 4b. Insert points ledger entry
      await em.query(
        `INSERT INTO points_ledger
           (id, tenant_id, customer_id, delta, reason,
            ref_transaction_id, balance_after, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          uuidv4(),
          tenantId,
          dto.customerId,
          pointsEarned,
          PointsLedgerReason.PURCHASE,
          transactionId,
          newBalance,
        ],
      );

      // 4c. Atomic customer update — never read-then-write to avoid races
      await em.query(
        `UPDATE customers SET
           points_balance   = points_balance   + $1,
           lifetime_points  = lifetime_points  + $1,
           total_spend      = total_spend      + $2::numeric,
           quarterly_spend  = quarterly_spend  + $2::numeric,
           purchase_count   = purchase_count   + 1,
           last_purchase_at = NOW(),
           updated_at       = NOW()
         WHERE id = $3 AND tenant_id = $4`,
        [pointsEarned, dto.amount, dto.customerId, tenantId],
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

    // Step 5 — Fire-and-forget events (OUTSIDE the DB transaction)
    // These will be replaced with real BullMQ queue.add() calls in the
    // queues module. Do NOT await these — a failed emit must never cause
    // the HTTP response to fail after a committed transaction.

    // TODO Prompt 21: replace with triggerCheckQueue.add('check-triggers', payload)
    try {
      this.eventEmitter.emit('queue.trigger.check', {
        tenantId,
        customerId: dto.customerId,
        transactionId,
      });
    } catch (err) {
      this.logger.error(`Failed to emit queue.trigger.check: ${String(err)}`);
    }

    // TODO Prompt 21: replace with waMessagesQueue.add('send-message', payload)
    try {
      this.eventEmitter.emit('queue.wa.message', {
        type: 'purchase_confirmation',
        tenantId,
        customerId: dto.customerId,
        data: {
          pointsEarned: pointsEarned.toString(),
          newBalance: newBalance.toString(),
          threshold: String(tenant.pointsThreshold),
          rewardValue: String(tenant.rewardValue),
        },
      });
    } catch (err) {
      this.logger.error(`Failed to emit queue.wa.message: ${String(err)}`);
    }

    return this.buildResult(savedTx, tenant.pointsThreshold, false);
  }

  // ── GET /transactions ───────────────────────────────────────────────────────

  async findAll(
    tenantId: string,
    query: ListTransactionsQuery,
  ): Promise<TransactionListResult> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const qb = this.txRepo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.customer', 'customer')
      .leftJoinAndSelect('tx.category', 'category')
      .where('tx.tenantId = :tenantId', { tenantId })
      .orderBy('tx.createdAt', 'DESC')
      .take(limit)
      .skip((page - 1) * limit);

    if (query.customerId) {
      qb.andWhere('customer.id = :customerId', {
        customerId: query.customerId,
      });
    }
    if (query.categoryId) {
      qb.andWhere('category.id = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    if (query.startDate) {
      qb.andWhere('tx.createdAt >= :startDate', {
        startDate: new Date(query.startDate),
      });
    }
    if (query.endDate) {
      qb.andWhere('tx.createdAt <= :endDate', {
        endDate: new Date(query.endDate),
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
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
  ): Promise<TransactionListResult> {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId, tenantId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const [data, total] = await this.txRepo.findAndCount({
      where: { tenantId, customer: { id: customerId } as Customer },
      relations: ['category'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return { data, total, page, limit };
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
