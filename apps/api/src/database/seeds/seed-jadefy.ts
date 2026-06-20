/**
 * Demo data seed for the "Jadefy Store" tenant.
 *
 * Creates a tenant with an owner login, tier configs (Standard/Mid/VIP),
 * product categories, 6 customers spanning every tier and activity status,
 * and campaigns that exercise every audience description on the
 * Campaigns page (tier-based, category-based, points-based, active,
 * inactive and "all customers").
 *
 * Re-runnable: deletes any existing "jadefy-store" tenant (and everything
 * that cascades from it) before inserting fresh data.
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register src/database/seeds/seed-jadefy.ts
 */
import 'reflect-metadata';
import * as path from 'path';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import {
  CampaignLogStatus,
  CampaignStatus,
  CustomerSource,
  PlanTier,
  SubscriptionStatus,
  TenantMode,
  UserRole,
  WaVerificationStatus,
} from '@pingloyal/types';
import { Tenant } from '../../modules/tenants/entities/tenant.entity';
import { TierConfig } from '../../modules/tenants/entities/tier-config.entity';
import { ProductCategory } from '../../modules/tenants/entities/product-category.entity';
import { User } from '../../modules/auth/entities/user.entity';
import { Customer } from '../../modules/customers/entities/customer.entity';
import { Campaign } from '../../modules/campaigns/entities/campaign.entity';
import { CampaignLog } from '../../modules/campaigns/entities/campaign-log.entity';
import { TriggerLog } from '../../modules/triggers/entities/trigger-log.entity';

dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../../../../.env') });

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required. Ensure .env is configured before running this seed.',
  );
}

// Seed scripts run via ts-node directly, so entities are listed explicitly
// rather than via the compiled-output glob used by SeedDataSource.
const SeedDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    Tenant,
    TierConfig,
    ProductCategory,
    User,
    Customer,
    Campaign,
    CampaignLog,
    TriggerLog,
  ],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: false,
});

const TENANT_SLUG = 'jadefy-store';
const BCRYPT_ROUNDS = 12;

const daysAgo = (days: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

async function main() {
  await SeedDataSource.initialize();

  await SeedDataSource.transaction(async (manager) => {
    // ── Cleanup any previous run ──────────────────────────────────────────────
    const existing = await manager.findOne(Tenant, {
      where: { slug: TENANT_SLUG },
    });
    if (existing) {
      await manager.delete(CampaignLog, { tenantId: existing.id });
      await manager.delete(TriggerLog, { tenantId: existing.id });
      await manager.delete(Tenant, { id: existing.id });
    }

    // ── Tenant ───────────────────────────────────────────────────────────────
    const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const tenant = await manager.save(
      manager.create(Tenant, {
        businessName: 'Jadefy Store',
        slug: TENANT_SLUG,
        currency: 'NGN',
        timezone: 'Africa/Lagos',
        mode: TenantMode.NATIVE,
        planTier: PlanTier.GROWTH,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        trialEndsAt: trialEnd,
        // BSP/Gupshup integration is intentionally skipped for this demo
        // tenant — no waPhoneNumber/gupshupAppId is set, so this must stay
        // PENDING (not VERIFIED) or the Settings page shows "Connected"
        // with no real connection behind it.
        waVerificationStatus: WaVerificationStatus.PENDING,
        marketingWalletBalance: 25000,
        pointsEarnRate: 1,
        pointsThreshold: 1000,
        rewardValue: 1000,
        lapsedDays: 60,
      }),
    );

    // ── Owner login ──────────────────────────────────────────────────────────
    const hashedPassword = await bcrypt.hash('Jadefy2026!', BCRYPT_ROUNDS);
    await manager.save(
      manager.create(User, {
        tenantId: tenant.id,
        email: 'owner@jadefystore.com',
        hashedPassword,
        fullName: 'Jadefy Store Owner',
        role: UserRole.OWNER,
        isActive: true,
        emailVerifiedAt: new Date(),
      }),
    );

    // ── Tier configs (Standard / Mid / VIP) ─────────────────────────────────────
    const [standardTier, midTier, vipTier] = await manager.save(TierConfig, [
      manager.create(TierConfig, {
        tenantId: tenant.id,
        tierName: 'standard',
        tierLabel: 'Standard',
        minQuarterlySpend: 0,
        maxQuarterlySpend: 49999,
        displayOrder: 0,
      }),
      manager.create(TierConfig, {
        tenantId: tenant.id,
        tierName: 'mid',
        tierLabel: 'Mid',
        minQuarterlySpend: 50000,
        maxQuarterlySpend: 149999,
        displayOrder: 1,
      }),
      manager.create(TierConfig, {
        tenantId: tenant.id,
        tierName: 'vip',
        tierLabel: 'VIP',
        minQuarterlySpend: 150000,
        maxQuarterlySpend: null,
        displayOrder: 2,
      }),
    ]);

    // ── Product categories ──────────────────────────────────────────────────
    const [foodCategory, babyCategory, electronicsCategory, fashionCategory] =
      await manager.save(ProductCategory, [
        manager.create(ProductCategory, {
          tenantId: tenant.id,
          name: 'Food & Groceries',
          slug: 'food',
          isActive: true,
        }),
        manager.create(ProductCategory, {
          tenantId: tenant.id,
          name: 'Baby Products',
          slug: 'baby_products',
          isActive: true,
        }),
        manager.create(ProductCategory, {
          tenantId: tenant.id,
          name: 'Electronics',
          slug: 'electronics',
          isActive: true,
        }),
        manager.create(ProductCategory, {
          tenantId: tenant.id,
          name: 'Fashion & Clothing',
          slug: 'fashion',
          isActive: true,
        }),
      ]);
    void foodCategory;
    void electronicsCategory;
    void fashionCategory;

    // ── Customers (2 per tier — covers VIP / Mid / Standard, active + inactive) ──
    const customers = await manager.save(Customer, [
      manager.create(Customer, {
        tenantId: tenant.id,
        fullName: 'Adaeze Okafor',
        phoneE164: '+2348031234001',
        waOptedIn: true,
        waOptedInAt: daysAgo(180),
        pointsBalance: 1200,
        lifetimePoints: 3400,
        totalSpend: 250000,
        quarterlySpend: 180000,
        tierId: vipTier.id,
        purchaseCount: 24,
        lastPurchaseAt: daysAgo(2),
        source: CustomerSource.QR_REGISTRATION,
        isActive: true,
      }),
      manager.create(Customer, {
        tenantId: tenant.id,
        fullName: 'Chidinma Eze',
        phoneE164: '+2348031234002',
        waOptedIn: true,
        waOptedInAt: daysAgo(200),
        pointsBalance: 1500,
        lifetimePoints: 4100,
        totalSpend: 320000,
        quarterlySpend: 210000,
        tierId: vipTier.id,
        purchaseCount: 30,
        lastPurchaseAt: daysAgo(5),
        source: CustomerSource.QR_REGISTRATION,
        isActive: true,
      }),
      manager.create(Customer, {
        tenantId: tenant.id,
        fullName: 'Tunde Bakare',
        phoneE164: '+2348031234003',
        waOptedIn: true,
        waOptedInAt: daysAgo(150),
        pointsBalance: 600,
        lifetimePoints: 1800,
        totalSpend: 90000,
        quarterlySpend: 75000,
        tierId: midTier.id,
        purchaseCount: 12,
        lastPurchaseAt: daysAgo(10),
        source: CustomerSource.QR_REGISTRATION,
        isActive: true,
      }),
      manager.create(Customer, {
        tenantId: tenant.id,
        fullName: 'Funke Adeyemi',
        phoneE164: '+2348031234004',
        waOptedIn: true,
        waOptedInAt: daysAgo(220),
        pointsBalance: 450,
        lifetimePoints: 1500,
        totalSpend: 110000,
        quarterlySpend: 95000,
        tierId: midTier.id,
        purchaseCount: 15,
        lastPurchaseAt: daysAgo(80),
        source: CustomerSource.QR_REGISTRATION,
        isActive: true,
      }),
      manager.create(Customer, {
        tenantId: tenant.id,
        fullName: 'Ibrahim Musa',
        phoneE164: '+2348031234005',
        waOptedIn: true,
        waOptedInAt: daysAgo(60),
        pointsBalance: 150,
        lifetimePoints: 300,
        totalSpend: 25000,
        quarterlySpend: 20000,
        tierId: standardTier.id,
        purchaseCount: 4,
        lastPurchaseAt: daysAgo(3),
        source: CustomerSource.QR_REGISTRATION,
        isActive: true,
      }),
      manager.create(Customer, {
        tenantId: tenant.id,
        fullName: 'Grace Nwosu',
        phoneE164: '+2348031234006',
        waOptedIn: false,
        waOptedInAt: null,
        pointsBalance: 80,
        lifetimePoints: 120,
        totalSpend: 15000,
        quarterlySpend: 12000,
        tierId: standardTier.id,
        purchaseCount: 2,
        lastPurchaseAt: daysAgo(95),
        source: CustomerSource.QR_REGISTRATION,
        isActive: true,
      }),
    ]);

    // ── Campaigns — one per audience description on the Campaigns page ─────────
    const [vipCampaign, , lapsedCampaign, , activeCampaign] =
      await manager.save(Campaign, [
        manager.create(Campaign, {
          tenantId: tenant.id,
          name: 'VIP Appreciation Night',
          messageBody:
            "You're one of our top customers! Join us this Friday for an exclusive VIP shopping night with special discounts. 🎉",
          segmentRules: { tierIds: [vipTier.id] },
          status: CampaignStatus.SENT,
          sentAt: daysAgo(7),
          totalRecipients: 2,
          sentCount: 2,
          deliveredCount: 2,
          failedCount: 0,
        }),
        manager.create(Campaign, {
          tenantId: tenant.id,
          name: 'New Baby Products Arrived',
          messageBody:
            'We just restocked baby essentials — diapers, formula and more, now available at Jadefy Store. Come check them out!',
          segmentRules: { categoryIds: [babyCategory.id] },
          status: CampaignStatus.DRAFT,
          totalRecipients: 0,
          sentCount: 0,
          deliveredCount: 0,
          failedCount: 0,
        }),
        manager.create(Campaign, {
          tenantId: tenant.id,
          name: 'We Miss You!',
          messageBody:
            "It's been a while since your last visit. Come back this week and enjoy a special welcome-back discount on us!",
          segmentRules: { activityStatus: 'inactive' },
          status: CampaignStatus.SENT,
          sentAt: daysAgo(3),
          totalRecipients: 2,
          sentCount: 2,
          deliveredCount: 1,
          failedCount: 1,
        }),
        manager.create(Campaign, {
          tenantId: tenant.id,
          name: '500 Points Bonus Reward',
          messageBody:
            "You've earned 500+ points! Redeem them on your next visit for a free gift at Jadefy Store. Don't miss out!",
          segmentRules: { minPoints: 500 },
          status: CampaignStatus.SCHEDULED,
          scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          totalRecipients: 0,
          sentCount: 0,
          deliveredCount: 0,
          failedCount: 0,
        }),
        manager.create(Campaign, {
          tenantId: tenant.id,
          name: 'Thank You For Shopping',
          messageBody:
            'Thank you for being a loyal Jadefy Store customer! Enjoy 10% off your next purchase as a token of our appreciation.',
          segmentRules: { activityStatus: 'active' },
          status: CampaignStatus.SENT,
          sentAt: daysAgo(1),
          totalRecipients: 4,
          sentCount: 4,
          deliveredCount: 4,
          failedCount: 0,
        }),
        manager.create(Campaign, {
          tenantId: tenant.id,
          name: 'Store Re-Launch Announcement',
          messageBody:
            "Big news! Jadefy Store has a fresh new look and even better deals. Visit us this week to see what's new.",
          segmentRules: {},
          status: CampaignStatus.DRAFT,
          totalRecipients: 0,
          sentCount: 0,
          deliveredCount: 0,
          failedCount: 0,
        }),
      ]);

    // ── Campaign logs — recipient-level detail for the campaign detail page ────
    const [adaeze, chidinma, tunde, funke, ibrahim, grace] = customers;

    await manager.save(CampaignLog, [
      // VIP Appreciation Night — sent 7 days ago, both delivered
      manager.create(CampaignLog, {
        tenantId: tenant.id,
        campaign: { id: vipCampaign.id },
        customer: { id: adaeze.id },
        status: CampaignLogStatus.DELIVERED,
        waMessageId:
          'wamid.HBgNMjM0ODAzMTIzNDAwMRUCABIYFjNFQjBBQUFBQUFBQUFBQUFBQUFBAA==',
        sentAt: daysAgo(7),
        deliveredAt: daysAgo(7),
      }),
      manager.create(CampaignLog, {
        tenantId: tenant.id,
        campaign: { id: vipCampaign.id },
        customer: { id: chidinma.id },
        status: CampaignLogStatus.DELIVERED,
        waMessageId:
          'wamid.HBgNMjM0ODAzMTIzNDAwMhUCABIYFjNFQjBBQUFBQUFBQUFBQUFBQUFCQQ==',
        sentAt: daysAgo(7),
        deliveredAt: daysAgo(7),
      }),

      // We Miss You! — sent 3 days ago, 1 delivered, 1 failed (not opted in)
      manager.create(CampaignLog, {
        tenantId: tenant.id,
        campaign: { id: lapsedCampaign.id },
        customer: { id: funke.id },
        status: CampaignLogStatus.DELIVERED,
        waMessageId:
          'wamid.HBgNMjM0ODAzMTIzNDAwNBUCABIYFjNFQjBBQUFBQUFBQUFBQUFBQUFDQg==',
        sentAt: daysAgo(3),
        deliveredAt: daysAgo(3),
      }),
      manager.create(CampaignLog, {
        tenantId: tenant.id,
        campaign: { id: lapsedCampaign.id },
        customer: { id: grace.id },
        status: CampaignLogStatus.FAILED,
        waMessageId: null,
        errorMessage: 'customer_not_opted_in',
        failedAt: daysAgo(3),
      }),

      // Thank You For Shopping — sent yesterday, all 4 delivered
      manager.create(CampaignLog, {
        tenantId: tenant.id,
        campaign: { id: activeCampaign.id },
        customer: { id: adaeze.id },
        status: CampaignLogStatus.DELIVERED,
        waMessageId:
          'wamid.HBgNMjM0ODAzMTIzNDAwMRUCABIYFjNFQjBBQUFBQUFBQUFBQUFBQUFDQw==',
        sentAt: daysAgo(1),
        deliveredAt: daysAgo(1),
      }),
      manager.create(CampaignLog, {
        tenantId: tenant.id,
        campaign: { id: activeCampaign.id },
        customer: { id: chidinma.id },
        status: CampaignLogStatus.DELIVERED,
        waMessageId:
          'wamid.HBgNMjM0ODAzMTIzNDAwMhUCABIYFjNFQjBBQUFBQUFBQUFBQUFBQUFERA==',
        sentAt: daysAgo(1),
        deliveredAt: daysAgo(1),
      }),
      manager.create(CampaignLog, {
        tenantId: tenant.id,
        campaign: { id: activeCampaign.id },
        customer: { id: tunde.id },
        status: CampaignLogStatus.DELIVERED,
        waMessageId:
          'wamid.HBgNMjM0ODAzMTIzNDAwMxUCABIYFjNFQjBBQUFBQUFBQUFBQUFBQUFFRQ==',
        sentAt: daysAgo(1),
        deliveredAt: daysAgo(1),
      }),
      manager.create(CampaignLog, {
        tenantId: tenant.id,
        campaign: { id: activeCampaign.id },
        customer: { id: ibrahim.id },
        status: CampaignLogStatus.DELIVERED,
        waMessageId:
          'wamid.HBgNMjM0ODAzMTIzNDAwNRUCABIYFjNFQjBBQUFBQUFBQUFBQUFBQUFGRg==',
        sentAt: daysAgo(1),
        deliveredAt: daysAgo(1),
      }),
    ]);

    console.log('[seed:jadefy] Tenant created:', tenant.id);
    console.log('[seed:jadefy] Slug:', tenant.slug);
    console.log(
      '[seed:jadefy] Owner login: owner@jadefystore.com / Jadefy2026!',
    );
  });

  await SeedDataSource.destroy();
  console.log('[seed:jadefy] Done.');
}

main().catch((err: unknown) => {
  console.error('[seed:jadefy] FAILED:', err);
  process.exit(1);
});
