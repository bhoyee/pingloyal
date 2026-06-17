'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Label,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  RefreshCw,
  Download,
  AlertTriangle,
  FileText,
  FileSpreadsheet,
  Mail,
  TrendingUp,
  Users,
  MessageSquare,
  Wallet,
} from 'lucide-react';
import { api, API_BASE_URL } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

type PeriodType = 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'custom';

interface ReportData {
  period: { type: string; start: string; end: string };
  generatedAt: string;
  loyalty: {
    totalCustomers: number;
    activeCustomers: number;
    inactiveCustomers: number;
    retentionRate: number;
    newCustomersThisMonth: number;
    avgVisitsPerCustomer: number;
    weeklyNewCustomers: Array<{ week: string; count: number }>;
    vsLastPeriod: { totalCustomers: number; activeRate: number; avgVisitsPerCustomer: number };
  };
  points: {
    issued: number;
    redeemed: number;
    redemptionRate: number;
    nearRewardCount: number;
    avgPointsPerCustomer: number;
    dailyIssued: Array<{ date: string; amount: number }>;
    issuedVsLastPeriod: number | null;
  };
  whatsapp: {
    totalSent: number;
    deliveryRate: number;
    botInteractions: number;
    triggerBreakdown: Record<string, { sent: number; delivered: number; rate: number; cost: string }>;
  };
  wallet: {
    totalSpend: number;
    spendByType: Record<string, number>;
    costPerReach: number;
    estimatedRoi: number;
    estimatedRevenue: number;
    lapsedCustomerCount: number;
    avgTransactionValue: number;
  };
  content: {
    bestCampaign: { id: string; name: string; deliveryRate: number; sentCount?: number; sentAt?: string } | null;
    busiestDayOfWeek: Array<{ day: string; count: number }>;
    topCustomers: Array<{ id: string; fullName: string; totalSpend: number; pointsBalance: number; tierLabel: string | null; visitCount?: number }>;
    categoryBreakdown: Array<{ name: string; percentage: number }>;
  };
}

interface ReportSchedule {
  id: string;
  email: string;
  isActive: boolean;
}

// ── Colour tokens ──────────────────────────────────────────────────────────────

const SPEND_COLOURS: Record<string, string> = {
  debit_campaign: '#f59e0b',
  debit_lapsed: '#3b82f6',
  debit_birthday: '#25D366',
  debit_utility_overage: '#9ca3af',
};

const SPEND_LABELS: Record<string, string> = {
  debit_campaign: 'Campaign broadcasts',
  debit_lapsed: 'Lapsed win-backs',
  debit_birthday: 'Birthday messages',
  debit_utility_overage: 'Utility overage',
};
const PALETTE = ['#25D366', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// ── Small helpers ──────────────────────────────────────────────────────────────

function toLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtNum(n: number) {
  return n.toLocaleString();
}

function fmtSpend(n: number): string {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${Math.round(n / 1_000)}k`;
  return `₦${Math.round(n)}`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function prevDayName(dayName: string): string {
  const idx = DAYS.findIndex((d) => d.toLowerCase() === dayName.toLowerCase().trim());
  if (idx < 0) return dayName;
  return DAYS[(idx + 6) % 7];
}

function formatSentAt(sentAt: string): string {
  const d = new Date(sentAt);
  return (
    d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }) +
    ', ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
}

const TRIGGER_LABELS: Record<string, string> = {
  purchase_confirmation: 'Purchase Confirmation',
  welcome: 'Welcome Message',
  reward_unlocked: 'Reward Unlocked',
  threshold_nudge: '80% Threshold Nudge',
  birthday: 'Birthday Message',
  lapsed_winback: 'Lapsed Win-back',
  campaign_message: 'Campaign Broadcasts',
  balance_bot_reply: 'Bot Replies',
  wallet_low_balance: 'Wallet Low Alert',
  wallet_zero: 'Wallet Empty Alert',
};

type TriggerCategory = 'Utility' | 'Marketing' | 'Service';

const TRIGGER_CATEGORY: Record<string, TriggerCategory> = {
  welcome: 'Utility',
  purchase_confirmation: 'Utility',
  threshold_nudge: 'Utility',
  reward_unlocked: 'Utility',
  birthday: 'Marketing',
  lapsed_winback: 'Marketing',
  campaign_message: 'Marketing',
  balance_bot_reply: 'Service',
  wallet_low_balance: 'Service',
  wallet_zero: 'Service',
};

const TRIGGER_SORT_ORDER = [
  'purchase_confirmation', 'welcome', 'reward_unlocked', 'threshold_nudge',
  'birthday', 'lapsed_winback', 'campaign_message',
  'balance_bot_reply', 'wallet_low_balance', 'wallet_zero',
];

const CATEGORY_EMOJIS: Record<string, string> = {
  'Food & Groceries': '🍎',
  'Groceries': '🛒',
  'Beverages': '🥤',
  'Baby Products': '🧸',
  'Household': '🏠',
  'Clothing': '👕',
  'Electronics': '📱',
  'Health & Beauty': '💄',
  'Snacks': '🍿',
  'Pharmacy': '💊',
};

// ── UI primitives ──────────────────────────────────────────────────────────────

function StatCard({
  value, label, sub, accent, labelFirst, subAccent,
}: { value: string | number; label: string; sub?: string; accent?: string; labelFirst?: boolean; subAccent?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {labelFirst
        ? <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        : null}
      <p className={`text-2xl font-bold ${accent ?? 'text-slate-900'}`}>{value}</p>
      {!labelFirst && <p className="mt-0.5 text-sm font-medium text-slate-500">{label}</p>}
      {sub && <p className={`mt-0.5 text-xs ${subAccent ?? 'text-slate-400'}`}>{sub}</p>}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 h-7 w-20 rounded bg-slate-200" />
      <div className="h-4 w-32 rounded bg-slate-100" />
    </div>
  );
}

function ChartBox({ title, children, minH = 220 }: { title: string; children: React.ReactNode; minH?: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div style={{ minHeight: minH }}>{children}</div>
    </div>
  );
}

function NoData({ label = 'No data for this period' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center text-sm text-slate-400">
      {label}
    </div>
  );
}

function SectionHeading({
  icon: Icon, label,
}: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-slate-400" />
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">{label}</h2>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [period, setPeriod] = useState<PeriodType>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [dlPdf, setDlPdf] = useState(false);
  const [dlXls, setDlXls] = useState(false);
  const [dlError, setDlError] = useState('');
  const [scheduleEmail, setScheduleEmail] = useState('');
  const [scheduleMsg, setScheduleMsg] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) { router.replace('/login'); return; }
    setReady(true);
  }, [router]);

  const periodQuery =
    period === 'custom' && customStart && customEnd
      ? `period=custom&start=${customStart}&end=${customEnd}`
      : `period=${period}`;

  const {
    data: report,
    isLoading,
    error: reportError,
    isFetching,
    dataUpdatedAt,
  } = useQuery<ReportData>({
    queryKey: ['reports', periodQuery],
    queryFn: () => api.get<ReportData>(`/api/v1/reports/summary?${periodQuery}`),
    enabled: ready,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const { data: schedule, refetch: refetchSchedule } = useQuery<ReportSchedule | null>({
    queryKey: ['reports-schedule'],
    queryFn: () => api.get<ReportSchedule | null>('/api/v1/reports/schedule'),
    enabled: ready,
    retry: 1,
  });

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const fresh = await api.post<ReportData>(`/api/v1/reports/refresh?${periodQuery}`, {});
      queryClient.setQueryData(['reports', periodQuery], fresh);
    } catch {
      // silent — query will retry on its own
    } finally {
      setRefreshing(false);
    }
  }

  async function downloadFile(
    endpoint: string,
    fallbackFilename: string,
    setLoading: (v: boolean) => void,
  ) {
    setDlError('');
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token') ?? '';
      const res = await fetch(`${API_BASE_URL}/api/v1/${endpoint}?${periodQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({})) as { message?: string }).message;
        throw new Error(msg ?? `Server error ${res.status}`);
      }
      // Use server-provided filename (contains store name) when available
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match ? match[1] : fallbackFilename;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDlError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSchedule() {
    try {
      await api.post('/api/v1/reports/schedule', { email: scheduleEmail, frequency: 'monthly' });
      setScheduleMsg('Report scheduled ✓');
      void refetchSchedule();
    } catch (err) {
      setScheduleMsg(err instanceof Error ? err.message : 'Failed to schedule');
    }
  }

  async function handleCancelSchedule() {
    await api.delete('/api/v1/reports/schedule');
    void refetchSchedule();
  }

  const today = new Date().toISOString().split('T')[0];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900">Reports</h1>
            {isFetching && !isLoading && (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />
            )}
            {dataUpdatedAt > 0 && (
              <span className="text-xs text-slate-400">
                Updated {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodType)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F1E35]/20"
            >
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="last_3_months">Last 3 Months</option>
              <option value="last_6_months">Last 6 Months</option>
              <option value="custom">Custom Range</option>
            </select>

            {period === 'custom' && (
              <>
                <input type="date" max={today} value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-[#0F1E35] focus:outline-none focus:ring-2 focus:ring-[#0F1E35]/20 [color-scheme:light]" />
                <span className="text-sm text-slate-400">→</span>
                <input type="date" max={today} value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-[#0F1E35] focus:outline-none focus:ring-2 focus:ring-[#0F1E35]/20 [color-scheme:light]" />
              </>
            )}

            <button
              onClick={() => void handleRefresh()}
              disabled={refreshing || isLoading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-8 px-4 py-6 sm:px-6">

        {/* Error banner */}
        {reportError && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Could not load report data</p>
              <p className="mt-0.5 text-red-600">
                {reportError instanceof Error ? reportError.message : 'Unexpected error — please try refreshing.'}
              </p>
            </div>
          </div>
        )}

        {/* ── SECTION 1: Loyalty ── */}
        <section>
          <div className="mb-4">
            <SectionHeading icon={Users} label="Loyalty Programme Performance" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
              : report
              ? (() => {
                  const currentActiveRate = report.loyalty.totalCustomers > 0
                    ? Math.round(report.loyalty.activeCustomers / report.loyalty.totalCustomers * 100)
                    : 0;
                  const deltaCustomers = report.loyalty.totalCustomers - report.loyalty.vsLastPeriod.totalCustomers;
                  const deltaActiveRate = currentActiveRate - report.loyalty.vsLastPeriod.activeRate;
                  const deltaAvgVisits = Math.round(
                    (report.loyalty.avgVisitsPerCustomer - report.loyalty.vsLastPeriod.avgVisitsPerCustomer) * 10
                  ) / 10;
                  function trendLabel(delta: number, unit: string): string {
                    const sign = delta >= 0 ? '+' : '';
                    const arrow = delta >= 0 ? '↑' : '↓';
                    return `${arrow} ${sign}${delta}${unit} vs last period`;
                  }
                  function trendClass(delta: number): string {
                    return delta >= 0 ? 'text-green-600 font-medium' : 'text-red-500 font-medium';
                  }
                  return (
                    <>
                      <StatCard
                        value={fmtNum(report.loyalty.totalCustomers)}
                        label="Total Customers"
                        sub={report.loyalty.vsLastPeriod.totalCustomers > 0
                          ? trendLabel(deltaCustomers, '')
                          : `${report.loyalty.inactiveCustomers} inactive`}
                        subAccent={report.loyalty.vsLastPeriod.totalCustomers > 0 ? trendClass(deltaCustomers) : undefined}
                        accent="text-green-600"
                        labelFirst
                      />
                      <StatCard
                        value={`${currentActiveRate}%`}
                        label="Active Rate"
                        sub={report.loyalty.vsLastPeriod.activeRate > 0
                          ? trendLabel(deltaActiveRate, '%')
                          : `${fmtNum(report.loyalty.activeCustomers)} active customers`}
                        subAccent={report.loyalty.vsLastPeriod.activeRate > 0 ? trendClass(deltaActiveRate) : undefined}
                        accent="text-green-600"
                        labelFirst
                      />
                      <StatCard
                        value={`${report.loyalty.retentionRate}%`}
                        label="Retention Rate"
                        sub="returned within 30 days"
                        labelFirst
                      />
                      <StatCard
                        value={report.loyalty.avgVisitsPerCustomer}
                        label="Avg Visits / Customer"
                        sub={report.loyalty.vsLastPeriod.avgVisitsPerCustomer > 0
                          ? trendLabel(deltaAvgVisits, '')
                          : 'avg visits per customer'}
                        subAccent={report.loyalty.vsLastPeriod.avgVisitsPerCustomer > 0 ? trendClass(deltaAvgVisits) : undefined}
                        labelFirst
                      />
                    </>
                  );
                })()
              : null}
          </div>

          {/* Weekly new customers chart */}
          {(isLoading || report) && (
            <div className="mt-4">
              <ChartBox title="New customers registered — week by week" minH={240}>
                {isLoading ? (
                  <div className="animate-pulse h-48 rounded bg-slate-100" />
                ) : report && report.loyalty.weeklyNewCustomers.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={report.loyalty.weeklyNewCustomers}
                        margin={{ top: 5, right: 20, left: 0, bottom: 32 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="week"
                          height={52}
                          tick={(props: { x: number; y: number; index: number }) => {
                            const { x, y, index } = props;
                            const entry = report.loyalty.weeklyNewCustomers[index];
                            return (
                              <g transform={`translate(${x},${y})`}>
                                <text dy={14} textAnchor="middle" fill="#64748b" fontSize={11} fontWeight={500}>
                                  W{index + 1}
                                </text>
                                <text dy={28} textAnchor="middle" fill="#94a3b8" fontSize={10}>
                                  {entry ? `${entry.count} new` : ''}
                                </text>
                              </g>
                            );
                          }}
                        />
                        <YAxis hide />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          labelFormatter={(v: unknown) => `Week of ${new Date(String(v)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                        />
                        <Bar dataKey="count" fill="#25D366" radius={[4, 4, 0, 0]} maxBarSize={80} name="New Customers" />
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="mt-1 text-right text-xs font-medium text-slate-500">
                      Total: {fmtNum(report.loyalty.weeklyNewCustomers.reduce((s, w) => s + w.count, 0))} new{' '}
                      {period === 'this_month' || period === 'last_month' ? 'this month' : 'this period'}
                    </p>
                  </>
                ) : (
                  <NoData label="No new customer data for this period" />
                )}
              </ChartBox>
            </div>
          )}
        </section>

        {/* ── SECTION 2: Points ── */}
        <section>
          <div className="mb-4">
            <SectionHeading icon={TrendingUp} label="Points & Rewards" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
              : report
              ? (() => {
                  const pct = report.points.issuedVsLastPeriod;
                  const trendSub = pct != null
                    ? `${pct >= 0 ? '↑' : '↓'} ${pct >= 0 ? '+' : ''}${pct}% vs last period`
                    : 'points this period';
                  const trendAccent = pct != null && pct >= 0
                    ? 'text-green-600 font-medium'
                    : pct != null && pct < 0
                    ? 'text-red-500 font-medium'
                    : 'text-slate-400';
                  return (
                    <>
                      <StatCard
                        value={fmtNum(report.points.issued)}
                        label="Points Issued"
                        sub={trendSub}
                        subAccent={trendAccent}
                        labelFirst
                      />
                      <StatCard
                        value={fmtNum(report.points.redeemed)}
                        label="Points Redeemed"
                        sub={`${report.points.redemptionRate}% redemption rate`}
                        labelFirst
                      />
                      <StatCard
                        value={fmtNum(report.points.avgPointsPerCustomer)}
                        label="Avg Points/Customer"
                        sub="across active customers"
                        labelFirst
                      />
                      <StatCard
                        value={fmtNum(report.points.nearRewardCount)}
                        label="Near Reward (80%+)"
                        sub="customers in pipeline"
                        accent="text-amber-500"
                        labelFirst
                      />
                    </>
                  );
                })()
              : null}
          </div>

          {(isLoading || report) && (
            <div className="mt-4">
              <ChartBox title="Points Issued — Daily" minH={200}>
                {isLoading ? (
                  <div className="animate-pulse h-44 rounded bg-slate-100" />
                ) : report && report.points.dailyIssued.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={report.points.dailyIssued} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="pointsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#25D366" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#25D366" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => {
                        const d = new Date(v);
                        return `${d.getDate()}/${d.getMonth() + 1}`;
                      }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Area type="monotone" dataKey="amount" stroke="#25D366" strokeWidth={2}
                        fill="url(#pointsGrad)" name="Points Issued" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <NoData label="No points activity for this period" />
                )}
              </ChartBox>
            </div>
          )}
        </section>

        {/* ── SECTION 3: WhatsApp ── */}
        <section>
          <div className="mb-4">
            <SectionHeading icon={MessageSquare} label="WhatsApp Message Performance" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
              : report
              ? (() => {
                  const marketingMsgCount = ['birthday', 'lapsed_winback', 'campaign_message']
                    .reduce((s, t) => s + (report.whatsapp.triggerBreakdown[t]?.sent ?? 0), 0);
                  return (
                    <>
                      <StatCard
                        value={fmtNum(report.whatsapp.totalSent)}
                        label="Total Messages Sent"
                        sub="Utility + Marketing"
                        labelFirst
                      />
                      <StatCard
                        value={`${report.whatsapp.deliveryRate}%`}
                        label="Overall Delivery Rate"
                        sub="↑ vs 78% industry avg"
                        accent={report.whatsapp.deliveryRate >= 90 ? 'text-green-600' : report.whatsapp.deliveryRate >= 70 ? 'text-amber-600' : 'text-red-600'}
                        labelFirst
                      />
                      <StatCard
                        value={fmtNum(report.whatsapp.botInteractions)}
                        label="Bot Balance Checks"
                        sub="free Service messages"
                        labelFirst
                      />
                      <StatCard
                        value={`₦${fmtNum(report.wallet.totalSpend)}`}
                        label="Marketing Wallet Spent"
                        sub={`${fmtNum(marketingMsgCount)} Marketing messages`}
                        labelFirst
                      />
                    </>
                  );
                })()
              : null}
          </div>

          {(isLoading || report) && (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-5 py-3">
                <p className="text-sm font-semibold text-slate-700">Trigger breakdown</p>
              </div>
              {isLoading ? (
                <div className="animate-pulse space-y-3 p-5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-8 rounded bg-slate-100" />
                  ))}
                </div>
              ) : report && Object.keys(report.whatsapp.triggerBreakdown).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <th className="px-5 py-3">Trigger</th>
                        <th className="px-5 py-3">Type</th>
                        <th className="px-5 py-3">Sent</th>
                        <th className="px-5 py-3">Delivered</th>
                        <th className="px-5 py-3">Rate</th>
                        <th className="px-5 py-3">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(report.whatsapp.triggerBreakdown)
                        .sort(([a], [b]) => {
                          const ai = TRIGGER_SORT_ORDER.indexOf(a);
                          const bi = TRIGGER_SORT_ORDER.indexOf(b);
                          return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
                        })
                        .map(([type, stats]) => {
                          const category: TriggerCategory = TRIGGER_CATEGORY[type] ?? 'Utility';
                          const badgeClass =
                            category === 'Marketing'
                              ? 'bg-amber-50 text-amber-600'
                              : category === 'Service'
                              ? 'bg-green-50 text-green-600'
                              : 'bg-blue-50 text-blue-600';
                          const costClass =
                            stats.cost === 'Plan included'
                              ? 'text-slate-400'
                              : stats.cost === 'Free'
                              ? 'text-green-600 font-medium'
                              : 'font-medium text-amber-700';
                          return (
                            <tr key={type} className="hover:bg-slate-50/60">
                              <td className="px-5 py-3 font-medium text-slate-700">
                                {TRIGGER_LABELS[type] ?? toLabel(type)}
                              </td>
                              <td className="px-5 py-3">
                                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}>
                                  {category}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-slate-600">{fmtNum(stats.sent)}</td>
                              <td className="px-5 py-3 text-slate-600">{fmtNum(stats.delivered)}</td>
                              <td className={`px-5 py-3 font-semibold ${stats.rate >= 90 ? 'text-green-600' : stats.rate >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                                {stats.rate}%
                              </td>
                              <td className={`px-5 py-3 text-xs ${costClass}`}>
                                {stats.cost}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 py-8 text-center text-sm text-slate-400">No WhatsApp messages sent this period</div>
              )}
            </div>
          )}
        </section>

        {/* ── SECTION 4: Wallet ── */}
        <section>
          <div className="mb-4">
            <SectionHeading icon={Wallet} label="Marketing Wallet & Spend Summary" />
          </div>

          {/* Three stat cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
              : report
              ? (
                <>
                  <StatCard
                    value={`₦${fmtNum(report.wallet.totalSpend)}`}
                    label="Total Marketing Spend"
                    sub="Birthday + Lapsed + Campaigns"
                    labelFirst
                  />
                  <StatCard
                    value={`₦${fmtNum(report.wallet.costPerReach)}/msg`}
                    label="Cost Per Marketing Message"
                    sub="your current plan rate"
                    labelFirst
                  />
                  <StatCard
                    value={`₦${fmtNum(report.wallet.estimatedRevenue)}`}
                    label="Est. Revenue from Win-backs"
                    sub={`${fmtNum(report.wallet.lapsedCustomerCount)} customers × avg ₦${fmtNum(report.wallet.avgTransactionValue)}`}
                    accent="text-green-600"
                    labelFirst
                  />
                </>
              )
              : null}
          </div>

          {/* Marketing spend breakdown card */}
          {(isLoading || report) && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
              <p className="mb-4 text-sm font-semibold text-slate-700">Marketing spend breakdown</p>
              {isLoading ? (
                <div className="animate-pulse h-52 rounded bg-slate-100" />
              ) : report && Object.keys(report.wallet.spendByType).length > 0 ? (() => {
                const spendEntries = Object.entries(report.wallet.spendByType)
                  .sort((a, b) => b[1] - a[1]);
                const total = report.wallet.totalSpend || 1;
                return (
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-center">

                    {/* Donut chart with center label */}
                    <div className="shrink-0 lg:w-44">
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie
                            data={spendEntries.map(([type, value]) => ({
                              name: SPEND_LABELS[type] ?? toLabel(type),
                              value,
                              type,
                            }))}
                            cx="50%" cy="50%"
                            innerRadius={46} outerRadius={68}
                            dataKey="value"
                            startAngle={90} endAngle={-270}
                          >
                            <Label
                              content={({ viewBox }) => {
                                const vb = viewBox as { cx?: number; cy?: number };
                                const cx = vb.cx ?? 0;
                                const cy = vb.cy ?? 0;
                                return (
                                  <text textAnchor="middle" dominantBaseline="middle">
                                    <tspan x={cx} y={cy - 7} fontSize="13" fontWeight="700" fill="#1e293b">
                                      {fmtSpend(report.wallet.totalSpend)}
                                    </tspan>
                                    <tspan x={cx} y={cy + 9} fontSize="10" fill="#94a3b8">total</tspan>
                                  </text>
                                );
                              }}
                            />
                            {spendEntries.map(([type], i) => (
                              <Cell key={type} fill={SPEND_COLOURS[type] ?? PALETTE[i % PALETTE.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ fontSize: 12, borderRadius: 8 }}
                            formatter={(v: unknown) => [`₦${fmtNum(Number(v))}`, '']}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Breakdown list */}
                    <div className="flex-1 space-y-3">
                      {spendEntries.map(([type, amount], i) => (
                        <div key={type} className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: SPEND_COLOURS[type] ?? PALETTE[i % PALETTE.length] }}
                            />
                            <span className="truncate text-sm text-slate-600">
                              {SPEND_LABELS[type] ?? toLabel(type)}
                            </span>
                          </div>
                          <span className="shrink-0 text-sm font-semibold text-slate-700 tabular-nums">
                            ₦{fmtNum(amount)} ({Math.round((amount / total) * 100)}%)
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* ROI card */}
                    <div className="shrink-0 rounded-xl bg-green-50 px-6 py-5 text-center lg:w-52">
                      <p className="text-xs font-semibold uppercase tracking-wide text-green-700">ROI on Marketing spend</p>
                      <p className="mt-2 text-4xl font-bold text-green-600">{report.wallet.estimatedRoi}×</p>
                      <p className="mt-1 text-xs text-green-600">
                        {fmtSpend(report.wallet.estimatedRevenue)} return on {fmtSpend(report.wallet.totalSpend)} spend
                      </p>
                    </div>

                  </div>
                );
              })() : (
                <NoData label="No wallet spend this period" />
              )}
            </div>
          )}
        </section>

        {/* ── SECTION 5: Insights ── */}
        <section>
          <div className="mb-4">
            <SectionHeading icon={TrendingUp} label="Top Content & Insights" />
          </div>

          {isLoading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : report ? (
            <div className="grid gap-4 lg:grid-cols-2">

              {/* ── Left column ── */}
              <div className="space-y-4">

                {/* Best campaign */}
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-5 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Best Campaign This Period</p>
                  </div>
                  {report.content.bestCampaign ? (
                    <div className="p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-xl">🛍️</div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-800">{report.content.bestCampaign.name}</p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            Sent to {fmtNum(report.content.bestCampaign.sentCount ?? 0)} customers
                            {report.content.bestCampaign.sentAt
                              ? ` · ${formatSentAt(report.content.bestCampaign.sentAt)}`
                              : ''}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-green-50 p-4 text-center">
                          <p className="text-3xl font-bold text-green-600">{report.content.bestCampaign.deliveryRate}%</p>
                          <p className="mt-1 text-xs font-medium text-green-700">Delivery rate</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-4 text-center">
                          <p className="text-3xl font-bold text-slate-700">{fmtNum(report.content.bestCampaign.sentCount ?? 0)}</p>
                          <p className="mt-1 text-xs font-medium text-slate-500">Recipients</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="px-5 py-8 text-center text-sm text-slate-400">No campaigns sent this period</p>
                  )}
                </div>

                {/* Busiest day */}
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Busiest Day of Week</p>
                  <p className="mb-3 mt-0.5 text-xs text-slate-400">Based on selected period</p>
                  {report.content.busiestDayOfWeek.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={report.content.busiestDayOfWeek} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                          <YAxis hide />
                          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Transactions">
                            {(() => {
                              const maxCount = Math.max(...report.content.busiestDayOfWeek.map((d) => d.count));
                              return report.content.busiestDayOfWeek.map((entry, i) => (
                                <Cell key={i} fill={entry.count === maxCount ? '#25D366' : '#e2e8f0'} />
                              ));
                            })()}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      {(() => {
                        const peak = report.content.busiestDayOfWeek.reduce((a, b) => a.count > b.count ? a : b);
                        return (
                          <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                            💡 {peak.day.trim()} is your peak day — consider scheduling campaigns {prevDayName(peak.day)} evening
                          </p>
                        );
                      })()}
                    </>
                  ) : (
                    <NoData label="No transaction data this period" />
                  )}
                </div>

              </div>

              {/* ── Right column ── */}
              <div className="space-y-4">

                {/* Top 5 customers */}
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-5 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top 5 Customers by Spend</p>
                  </div>
                  {report.content.topCustomers.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                      {report.content.topCustomers.map((c, i) => (
                        <div key={c.id} className="flex items-center gap-2.5 px-5 py-2.5">
                          <span className="w-5 shrink-0 text-center text-sm font-bold text-slate-300">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-slate-800">{c.fullName}</p>
                            <p className="mt-0.5 text-xs text-slate-400">
                              {c.visitCount ?? 0} visits · {fmtNum(c.pointsBalance)} pts
                            </p>
                          </div>
                          {c.tierLabel && (
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                              /vip/i.test(c.tierLabel)
                                ? 'bg-yellow-50 text-yellow-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {/vip/i.test(c.tierLabel) ? '👑' : '⭐'} {c.tierLabel}
                            </span>
                          )}
                          <span className="shrink-0 font-bold tabular-nums text-slate-800">{fmtSpend(c.totalSpend)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-5 py-8 text-center text-sm text-slate-400">No customer spend data yet</div>
                  )}
                </div>

                {/* Category breakdown — always render */}
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Top Category by Purchase Volume</p>
                  {report.content.categoryBreakdown.length > 0 ? (
                    <div className="space-y-3">
                      {report.content.categoryBreakdown.map((cat, i) => (
                        <div key={cat.name} className="flex items-center gap-3">
                          <span className="shrink-0 text-base">{CATEGORY_EMOJIS[cat.name] ?? '📦'}</span>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex justify-between text-xs">
                              <span className="truncate font-medium text-slate-700">{cat.name}</span>
                              <span className="ml-2 shrink-0 font-semibold text-slate-600">{cat.percentage}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${cat.percentage}%`, backgroundColor: PALETTE[i % PALETTE.length] }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-sm text-slate-400">No category data for this period</p>
                  )}
                </div>

              </div>
            </div>
          ) : null}
        </section>

        {/* ── SECTION 6: Export ── */}
        <section>
          <div className="mb-4">
            <SectionHeading icon={Download} label="Export & Share" />
          </div>

          {dlError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {dlError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            {/* PDF */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
                <FileText className="h-5 w-5 text-red-500" />
              </div>
              <p className="font-semibold text-slate-800">PDF Report</p>
              <p className="mt-1 text-xs text-slate-400">Full loyalty summary formatted for sharing or printing</p>
              <button
                onClick={() => void downloadFile('reports/pdf', `pingloyal-report-${period}.pdf`, setDlPdf)}
                disabled={dlPdf || isLoading}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0F1E35] py-2.5 text-sm font-medium text-white hover:bg-[#1a3050] disabled:opacity-50 transition-colors"
              >
                {dlPdf ? (
                  <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                ) : (
                  <><Download className="h-3.5 w-3.5" /> Download PDF</>
                )}
              </button>
            </div>

            {/* Excel */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
                <FileSpreadsheet className="h-5 w-5 text-green-600" />
              </div>
              <p className="font-semibold text-slate-800">Excel Export</p>
              <p className="mt-1 text-xs text-slate-400">Raw data across 5 sheets — loyalty, points, WhatsApp, wallet, customers</p>
              <button
                onClick={() => void downloadFile('reports/excel', `pingloyal-report-${period}.xlsx`, setDlXls)}
                disabled={dlXls || isLoading}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {dlXls ? (
                  <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                ) : (
                  <><Download className="h-3.5 w-3.5" /> Download Excel</>
                )}
              </button>
            </div>

            {/* Email schedule */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <Mail className="h-5 w-5 text-blue-500" />
              </div>
              <p className="font-semibold text-slate-800">Monthly Email Report</p>
              {schedule?.isActive ? (
                <div className="mt-2">
                  <p className="text-xs text-slate-500">
                    Sending to <span className="font-semibold text-slate-700">{schedule.email}</span> monthly
                  </p>
                  <button
                    onClick={() => void handleCancelSchedule()}
                    className="mt-3 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Cancel Schedule
                  </button>
                </div>
              ) : scheduleMsg ? (
                <p className={`mt-2 text-sm font-medium ${scheduleMsg.includes('✓') ? 'text-green-600' : 'text-red-600'}`}>{scheduleMsg}</p>
              ) : (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-slate-400">Receive an automated summary every month</p>
                  <input
                    type="email"
                    value={scheduleEmail}
                    onChange={(e) => setScheduleEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F1E35] focus:outline-none focus:ring-1 focus:ring-[#0F1E35]"
                  />
                  <button
                    onClick={() => void handleSchedule()}
                    disabled={!scheduleEmail.includes('@')}
                    className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    Enable Monthly Report
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
