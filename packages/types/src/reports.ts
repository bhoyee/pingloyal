export interface ReportPeriod {
  type: 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'custom';
  start: Date;
  end: Date;
  durationDays: number;
}

export interface ReportData {
  period: ReportPeriod;
  generatedAt: string;
  loyalty: LoyaltySection;
  points: PointsSection;
  whatsapp: WhatsappSection;
  wallet: WalletSection;
  content: ContentSection;
}

export interface LoyaltySection {
  totalCustomers: number;
  activeCustomers: number;
  inactiveCustomers: number;
  newCustomersThisMonth: number;
  retentionRate: number;
  avgVisitsPerCustomer: number;
  weeklyNewCustomers: Array<{ week: string; count: number }>;
  vsLastPeriod: {
    totalCustomers: number;
    activeRate: number;
  };
}

export interface PointsSection {
  issued: number;
  redeemed: number;
  redemptionRate: number;
  avgPointsPerCustomer: number;
  nearRewardCount: number;
  dailyIssued: Array<{ date: string; amount: number }>;
  issuedVsLastPeriod: number | null;
}

export interface WhatsappSection {
  totalSent: number;
  deliveryRate: number;
  botInteractions: number;
  triggerBreakdown: Record<
    string,
    { sent: number; delivered: number; rate: number; cost: string }
  >;
}

export interface WalletSection {
  totalSpend: number;
  spendByType: Record<string, number>;
  costPerReach: number;
  estimatedRoi: number;
  estimatedRevenue: number;
  lapsedCustomerCount: number;
  avgTransactionValue: number;
}

export interface ContentSection {
  bestCampaign: {
    id: string;
    name: string;
    deliveryRate: number;
    sentCount?: number;
    sentAt?: string;
  } | null;
  busiestDayOfWeek: Array<{ day: string; count: number }>;
  topCustomers: Array<{
    id: string;
    fullName: string;
    totalSpend: number;
    pointsBalance: number;
    tierLabel: string | null;
    visitCount?: number;
  }>;
  categoryBreakdown: Array<{ name: string; percentage: number }>;
}
