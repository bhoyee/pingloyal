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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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
    vsLastPeriod: { totalCustomers: number; activeRate: number };
  };
  points: {
    issued: number;
    redeemed: number;
    redemptionRate: number;
    nearRewardCount: number;
    avgPointsPerCustomer: number;
    dailyIssued: Array<{ date: string; amount: number }>;
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
  };
  content: {
    bestCampaign: { id: string; name: string; deliveryRate: number } | null;
    busiestDayOfWeek: Array<{ day: string; count: number }>;
    topCustomers: Array<{ id: string; fullName: string; totalSpend: number; pointsBalance: number; tierLabel: string | null }>;
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
  debit_birthday: '#3b82f6',
  debit_lapsed: '#ef4444',
  debit_campaign: '#f59e0b',
  debit_utility_overage: '#9ca3af',
};
const PALETTE = ['#25D366', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// ── Small helpers ──────────────────────────────────────────────────────────────

function toLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtNum(n: number) {
  return n.toLocaleString();
}

// ── UI primitives ──────────────────────────────────────────────────────────────

function StatCard({
  value, label, sub, accent,
}: { value: string | number; label: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className={`text-2xl font-bold ${accent ?? 'text-slate-900'}`}>{value}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-500">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
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
    filename: string,
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
            <SectionHeading icon={Users} label="Loyalty Performance" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
              : report
              ? (
                <>
                  <StatCard value={fmtNum(report.loyalty.totalCustomers)} label="Total Customers"
                    sub={`${report.loyalty.inactiveCustomers} inactive`} />
                  <StatCard value={fmtNum(report.loyalty.activeCustomers)} label="Active Customers"
                    sub={report.loyalty.totalCustomers > 0 ? `${Math.round(report.loyalty.activeCustomers / report.loyalty.totalCustomers * 100)}% of total` : undefined} />
                  <StatCard value={`${report.loyalty.retentionRate}%`} label="Retention Rate"
                    sub="purchased 2+ times"
                    accent={report.loyalty.retentionRate >= 50 ? 'text-green-600' : report.loyalty.retentionRate >= 25 ? 'text-amber-600' : 'text-slate-900'} />
                  <StatCard value={fmtNum(report.loyalty.newCustomersThisMonth)} label="New This Period"
                    sub={`avg ${report.loyalty.avgVisitsPerCustomer} visits/customer`} />
                </>
              )
              : null}
          </div>

          {/* Weekly new customers chart */}
          {(isLoading || report) && (
            <div className="mt-4">
              <ChartBox title="New Customers — Week by Week" minH={220}>
                {isLoading ? (
                  <div className="animate-pulse h-48 rounded bg-slate-100" />
                ) : report && report.loyalty.weeklyNewCustomers.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={report.loyalty.weeklyNewCustomers} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="week" tick={{ fontSize: 11 }} tickFormatter={(v: string) => {
                        const d = new Date(v);
                        return `${d.getDate()}/${d.getMonth() + 1}`;
                      }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        labelFormatter={(v: unknown) => `Week of ${new Date(String(v)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                      />
                      <Bar dataKey="count" fill="#25D366" radius={[4, 4, 0, 0]} name="New Customers" />
                    </BarChart>
                  </ResponsiveContainer>
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
              ? (
                <>
                  <StatCard value={fmtNum(report.points.issued)} label="Points Issued" />
                  <StatCard value={fmtNum(report.points.redeemed)} label="Points Redeemed" />
                  <StatCard value={`${report.points.redemptionRate}%`} label="Redemption Rate"
                    accent={report.points.redemptionRate >= 10 ? 'text-green-600' : 'text-slate-900'} />
                  <StatCard value={fmtNum(report.points.nearRewardCount)} label="Near Reward"
                    sub="at 80%+ of threshold" />
                </>
              )
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
            <SectionHeading icon={MessageSquare} label="WhatsApp Performance" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
              : report
              ? (
                <>
                  <StatCard value={fmtNum(report.whatsapp.totalSent)} label="Messages Sent" />
                  <StatCard value={`${report.whatsapp.deliveryRate}%`} label="Delivery Rate"
                    accent={report.whatsapp.deliveryRate >= 90 ? 'text-green-600' : report.whatsapp.deliveryRate >= 70 ? 'text-amber-600' : 'text-red-600'} />
                  <StatCard value={fmtNum(report.whatsapp.botInteractions)} label="Bot Interactions" sub="free balance checks" />
                  <StatCard value={Object.keys(report.whatsapp.triggerBreakdown).length} label="Active Trigger Types" />
                </>
              )
              : null}
          </div>

          {(isLoading || report) && (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-5 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trigger Breakdown</p>
              </div>
              {isLoading ? (
                <div className="animate-pulse space-y-3 p-5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-8 rounded bg-slate-100" />
                  ))}
                </div>
              ) : report && Object.keys(report.whatsapp.triggerBreakdown).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-5 py-3">Trigger Type</th>
                        <th className="px-5 py-3">Sent</th>
                        <th className="px-5 py-3">Delivered</th>
                        <th className="px-5 py-3">Rate</th>
                        <th className="px-5 py-3">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(report.whatsapp.triggerBreakdown).map(([type, stats]) => (
                        <tr key={type} className="hover:bg-slate-50/60">
                          <td className="px-5 py-3 font-medium text-slate-700">{toLabel(type)}</td>
                          <td className="px-5 py-3 text-slate-600">{fmtNum(stats.sent)}</td>
                          <td className="px-5 py-3 text-slate-600">{fmtNum(stats.delivered)}</td>
                          <td className={`px-5 py-3 font-semibold ${stats.rate >= 90 ? 'text-green-600' : stats.rate >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                            {stats.rate}%
                          </td>
                          <td className={`px-5 py-3 text-xs ${stats.cost === 'Plan included' ? 'text-slate-400' : 'font-medium text-amber-700'}`}>
                            {stats.cost}
                          </td>
                        </tr>
                      ))}
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
            <SectionHeading icon={Wallet} label="Wallet & Spend" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
              : report
              ? (
                <>
                  <StatCard value={`₦${fmtNum(report.wallet.totalSpend)}`} label="Total Marketing Spend" />
                  <StatCard value={`₦${fmtNum(report.wallet.costPerReach)}`} label="Cost per Reach" />
                  <StatCard
                    value={`${report.wallet.estimatedRoi}×`}
                    label="Estimated ROI"
                    sub="return on marketing spend"
                    accent={report.wallet.estimatedRoi > 3 ? 'text-green-600' : report.wallet.estimatedRoi >= 1 ? 'text-amber-600' : 'text-red-600'}
                  />
                </>
              )
              : null}
          </div>

          {(isLoading || report) && (
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ChartBox title="Spend by Transaction Type" minH={240}>
                  {isLoading ? (
                    <div className="animate-pulse h-52 rounded bg-slate-100" />
                  ) : report && Object.keys(report.wallet.spendByType).length > 0 ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={Object.entries(report.wallet.spendByType).map(([name, value]) => ({ name: toLabel(name), value }))}
                          cx="50%" cy="50%" innerRadius={60} outerRadius={95} dataKey="value"
                          label={({ name, percent }: { name?: string; percent?: number }) =>
                            `${name ?? ''} ${Math.round((percent ?? 0) * 100)}%`}
                          labelLine={false}
                        >
                          {Object.keys(report.wallet.spendByType).map((type, i) => (
                            <Cell key={type} fill={SPEND_COLOURS[type] ?? PALETTE[i % PALETTE.length]} />
                          ))}
                        </Pie>
                        <Legend formatter={(v: unknown) => <span style={{ fontSize: 12 }}>{String(v)}</span>} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          formatter={(v: unknown) => [`₦${fmtNum(Number(v))}`, 'Spend']} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <NoData label="No wallet spend this period" />
                  )}
                </ChartBox>
              </div>
              <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated ROI</p>
                {report ? (
                  <>
                    <p className={`mt-3 text-5xl font-bold ${report.wallet.estimatedRoi > 3 ? 'text-green-600' : report.wallet.estimatedRoi >= 1 ? 'text-amber-600' : 'text-red-500'}`}>
                      {report.wallet.estimatedRoi}×
                    </p>
                    <p className="mt-2 text-xs text-slate-400">on ₦{fmtNum(report.wallet.totalSpend)} spend</p>
                  </>
                ) : isLoading ? (
                  <div className="animate-pulse mt-3 h-12 w-20 rounded bg-slate-200" />
                ) : null}
              </div>
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
              {/* Left column */}
              <div className="space-y-4">
                {/* Best campaign */}
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Best Campaign</p>
                  {report.content.bestCampaign ? (
                    <div className="mt-2">
                      <p className="font-semibold text-slate-800">{report.content.bestCampaign.name}</p>
                      <div className="mt-2 flex items-end gap-2">
                        <span className="text-4xl font-bold text-green-600">{report.content.bestCampaign.deliveryRate}%</span>
                        <span className="mb-1 text-sm text-slate-400">delivery rate</span>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">No campaigns sent this period</p>
                  )}
                </div>

                {/* Busiest day */}
                <ChartBox title="Busiest Day of Week" minH={180}>
                  {report.content.busiestDayOfWeek.length > 0 ? (
                    <ResponsiveContainer width="100%" height={180}>
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
                  ) : (
                    <NoData label="No transaction data this period" />
                  )}
                </ChartBox>

                {/* Category breakdown */}
                {report.content.categoryBreakdown.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Category Breakdown</p>
                    <div className="space-y-3">
                      {report.content.categoryBreakdown.map((cat, i) => (
                        <div key={cat.name}>
                          <div className="mb-1 flex justify-between text-xs">
                            <span className="font-medium text-slate-700">{cat.name}</span>
                            <span className="text-slate-500">{cat.percentage}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${cat.percentage}%`, backgroundColor: PALETTE[i % PALETTE.length] }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right column — top customers */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top Customers by Spend</p>
                </div>
                {report.content.topCustomers.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[400px] text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-left text-xs text-slate-400">
                          <th className="px-5 py-3">Rank</th>
                          <th className="px-5 py-3">Name</th>
                          <th className="px-5 py-3">Spend</th>
                          <th className="px-5 py-3">Points</th>
                          <th className="px-5 py-3">Tier</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.content.topCustomers.map((c, i) => (
                          <tr key={c.id} className="hover:bg-slate-50/60">
                            <td className="px-5 py-3 text-base">{i === 0 ? '👑' : `#${i + 1}`}</td>
                            <td className="px-5 py-3 font-medium text-slate-800">{c.fullName}</td>
                            <td className="px-5 py-3 text-slate-600">₦{fmtNum(c.totalSpend)}</td>
                            <td className="px-5 py-3 text-slate-600">⭐ {fmtNum(c.pointsBalance)}</td>
                            <td className="px-5 py-3">
                              {c.tierLabel ? (
                                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">{c.tierLabel}</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="px-5 py-8 text-center text-sm text-slate-400">No customer spend data yet</div>
                )}
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
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#0F1E35] focus:outline-none focus:ring-1 focus:ring-[#0F1E35]"
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
