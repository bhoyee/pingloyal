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
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { api, API_BASE_URL } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

type PeriodType = 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'custom';

interface ReportData {
  period: { type: string; start: string; end: string };
  generatedAt: string;
  loyalty: {
    totalCustomers: number;
    activeCustomers: number;
    retentionRate: number;
    newCustomersThisMonth: number;
    weeklyNewCustomers: Array<{ week: string; count: number }>;
    vsLastPeriod: { totalCustomers: number; activeRate: number };
  };
  points: {
    issued: number;
    redeemed: number;
    redemptionRate: number;
    nearRewardCount: number;
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

// ── Colour maps ────────────────────────────────────────────────────────────────

const SPEND_COLOURS: Record<string, string> = {
  debit_birthday: '#3b82f6',
  debit_lapsed: '#ef4444',
  debit_campaign: '#f59e0b',
  debit_utility_overage: '#9ca3af',
};
const CATEGORY_COLOURS = ['#25D366', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// ── Small helpers ──────────────────────────────────────────────────────────────

function toTitleCase(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatCard({
  value, label, sub, colour,
}: { value: string | number; label: string; sub?: string; colour?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="stat-card">
      <p className={`text-2xl font-bold ${colour ?? 'text-slate-900'}`}>{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-4" data-testid="skeleton-card">
      <div className="mb-2 h-8 w-24 rounded bg-slate-200" />
      <div className="h-4 w-32 rounded bg-slate-100" />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-base font-bold text-slate-800">{children}</h2>;
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodType>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [scheduleEmail, setScheduleEmail] = useState('');
  const [scheduleMsg, setScheduleMsg] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) { router.replace('/login'); return; }
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { tenantId?: string };
      setTenantId(payload.tenantId ?? null);
    } catch { router.replace('/login'); }
  }, [router]);

  const periodQuery = period === 'custom' && customStart && customEnd
    ? `period=custom&start=${customStart}&end=${customEnd}`
    : `period=${period}`;

  const { data: report, isLoading } = useQuery<ReportData>({
    queryKey: ['reports', tenantId, periodQuery],
    queryFn: () => api.get<ReportData>(`/api/v1/reports/summary?${periodQuery}`),
    enabled: !!tenantId,
    staleTime: 300_000,
  });

  const { data: schedule, refetch: refetchSchedule } = useQuery<ReportSchedule | null>({
    queryKey: ['reports-schedule', tenantId],
    queryFn: () => api.get<ReportSchedule | null>('/api/v1/reports/schedule'),
    enabled: !!tenantId,
  });

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const fresh = await api.post<ReportData>(`/api/v1/reports/refresh?${periodQuery}`, {});
      await queryClient.setQueryData(['reports', tenantId, periodQuery], fresh);
    } finally {
      setRefreshing(false);
    }
  }

  async function downloadFile(endpoint: string, filename: string) {
    const token = localStorage.getItem('access_token') ?? '';
    const res = await fetch(`${API_BASE_URL}/api/v1/${endpoint}?${periodQuery}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSchedule() {
    await api.post('/api/v1/reports/schedule', { email: scheduleEmail, frequency: 'monthly' });
    setScheduleMsg('Report scheduled ✓');
    void refetchSchedule();
  }

  async function handleCancelSchedule() {
    await api.delete('/api/v1/reports/schedule');
    void refetchSchedule();
  }

  const today = new Date().toISOString().split('T')[0];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Reports</h1>

          <div className="flex items-center gap-3">
            {/* Period selector */}
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodType)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
              data-testid="period-select"
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
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                <span className="text-sm text-slate-400">→</span>
                <input type="date" max={today} value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-8 px-6 py-6">
        {/* Last updated + refresh */}
        <div className="flex items-center gap-3 text-xs text-slate-400">
          {report && (
            <span>Last updated {formatDistanceToNow(new Date(report.generatedAt), { addSuffix: true })}</span>
          )}
          <button
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="font-medium text-[#0F1E35] hover:underline disabled:opacity-50"
            data-testid="refresh-btn"
          >
            {refreshing ? '⏳ Refreshing…' : 'Refresh now'}
          </button>
        </div>

        {/* ── SECTION 1: Loyalty ──────────────────────────────────────────── */}
        <section data-testid="loyalty-section">
          <SectionTitle>Loyalty Performance</SectionTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            ) : report ? (
              <>
                <StatCard value={report.loyalty.totalCustomers} label="Total Customers" />
                <StatCard value={report.loyalty.activeCustomers} label="Active Customers"
                  sub={`${report.loyalty.totalCustomers > 0 ? Math.round(report.loyalty.activeCustomers / report.loyalty.totalCustomers * 100) : 0}% of total`} />
                <StatCard value={`${report.loyalty.retentionRate}%`} label="Retention Rate" sub="customers who purchased twice" />
                <StatCard value={report.loyalty.newCustomersThisMonth} label="New This Period" sub="joined in this period" />
              </>
            ) : null}
          </div>
          {report && report.loyalty.weeklyNewCustomers.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-2 text-xs font-semibold text-slate-500">New Customers — Week by Week</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={report.loyalty.weeklyNewCustomers}>
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#25D366" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* ── SECTION 2: Points ───────────────────────────────────────────── */}
        <section data-testid="points-section">
          <SectionTitle>Points & Rewards</SectionTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            ) : report ? (
              <>
                <StatCard value={report.points.issued.toLocaleString()} label="Points Issued" />
                <StatCard value={report.points.redeemed.toLocaleString()} label="Points Redeemed" />
                <StatCard value={`${report.points.redemptionRate}%`} label="Redemption Rate" />
                <StatCard value={report.points.nearRewardCount} label="Near Reward" sub="customers at 80%+ of threshold" />
              </>
            ) : null}
          </div>
          {report && report.points.dailyIssued.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-2 text-xs font-semibold text-slate-500">Points Issued — Daily</p>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={report.points.dailyIssued}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="amount" stroke="#25D366" fill="#25D36633" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* ── SECTION 3: WhatsApp ─────────────────────────────────────────── */}
        <section data-testid="whatsapp-section">
          <SectionTitle>WhatsApp Performance</SectionTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            ) : report ? (
              <>
                <StatCard value={report.whatsapp.totalSent} label="Messages Sent" />
                <StatCard value={`${report.whatsapp.deliveryRate}%`} label="Delivery Rate" />
                <StatCard value={report.whatsapp.botInteractions} label="Bot Interactions" sub="customer balance checks (free)" />
                <StatCard value={Object.keys(report.whatsapp.triggerBreakdown).length} label="Trigger Types" sub="active trigger types" />
              </>
            ) : null}
          </div>
          {report && Object.keys(report.whatsapp.triggerBreakdown).length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm" data-testid="trigger-table">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                    <th className="px-4 py-3">Trigger Type</th>
                    <th className="px-4 py-3">Sent</th>
                    <th className="px-4 py-3">Delivered</th>
                    <th className="px-4 py-3">Rate</th>
                    <th className="px-4 py-3">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(report.whatsapp.triggerBreakdown).map(([type, stats]) => (
                    <tr key={type}>
                      <td className="px-4 py-2 font-medium text-slate-700">{toTitleCase(type)}</td>
                      <td className="px-4 py-2 text-slate-600">{stats.sent}</td>
                      <td className="px-4 py-2 text-slate-600">{stats.delivered}</td>
                      <td className={`px-4 py-2 font-medium ${stats.rate >= 90 ? 'text-green-600' : 'text-amber-600'}`}>
                        {stats.rate}%
                      </td>
                      <td className={`px-4 py-2 text-xs ${stats.cost === 'Plan included' ? 'text-slate-400' : 'font-medium text-amber-700'}`}>
                        {stats.cost}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── SECTION 4: Wallet ───────────────────────────────────────────── */}
        <section data-testid="wallet-section">
          <SectionTitle>Wallet & Spend</SectionTitle>
          <div className="grid grid-cols-3 gap-4">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
            ) : report ? (
              <>
                <StatCard value={`₦${report.wallet.totalSpend.toLocaleString()}`} label="Total Spend" />
                <StatCard value={`₦${report.wallet.costPerReach}`} label="Cost per Reach" />
                <StatCard
                  value={`${report.wallet.estimatedRoi}x`}
                  label="Est. ROI"
                  sub="return on marketing spend"
                  colour={report.wallet.estimatedRoi > 3 ? 'text-green-600' : report.wallet.estimatedRoi >= 1 ? 'text-amber-600' : 'text-red-600'}
                />
              </>
            ) : null}
          </div>
          {report && Object.keys(report.wallet.spendByType).length > 0 && (
            <div className="mt-4 flex gap-4">
              <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4">
                <p className="mb-2 text-xs font-semibold text-slate-500">Spend by Type</p>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={Object.entries(report.wallet.spendByType).map(([name, value]) => ({ name, value }))}
                      cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
                      {Object.keys(report.wallet.spendByType).map((type, i) => (
                        <Cell key={type} fill={SPEND_COLOURS[type] ?? CATEGORY_COLOURS[i % CATEGORY_COLOURS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex w-52 flex-col justify-center rounded-xl border border-slate-200 bg-white p-5 text-center">
                <p className={`text-4xl font-bold ${report.wallet.estimatedRoi > 3 ? 'text-green-600' : report.wallet.estimatedRoi >= 1 ? 'text-amber-600' : 'text-red-600'}`}>
                  {report.wallet.estimatedRoi}x
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-700">ROI</p>
                <p className="mt-1 text-xs text-slate-400">estimated return on ₦{report.wallet.totalSpend.toLocaleString()} spend</p>
              </div>
            </div>
          )}
        </section>

        {/* ── SECTION 5: Content & Insights ───────────────────────────────── */}
        <section data-testid="content-section">
          <SectionTitle>Top Content & Insights</SectionTitle>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : report ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Left column */}
              <div className="space-y-4">
                {/* Best campaign */}
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="mb-1 text-xs font-semibold text-slate-500">Best Campaign</p>
                  {report.content.bestCampaign ? (
                    <>
                      <p className="text-sm font-medium text-slate-800">{report.content.bestCampaign.name}</p>
                      <p className="text-3xl font-bold text-green-600">{report.content.bestCampaign.deliveryRate}%</p>
                      <p className="text-xs text-slate-400">delivery rate</p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">No campaigns sent this period</p>
                  )}
                </div>

                {/* Busiest day */}
                {report.content.busiestDayOfWeek.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="mb-2 text-xs font-semibold text-slate-500">Busiest Day of Week</p>
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={report.content.busiestDayOfWeek}>
                        <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                        <YAxis hide />
                        <Tooltip />
                        <Bar dataKey="count"
                          fill="#e2e8f0"
                          label={false}
                        >
                          {report.content.busiestDayOfWeek.map((entry, i) => {
                            const maxCount = Math.max(...report.content.busiestDayOfWeek.map((d) => d.count));
                            return <Cell key={i} fill={entry.count === maxCount ? '#25D366' : '#e2e8f0'} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Right column */}
              <div className="space-y-4">
                {/* Top customers */}
                {report.content.topCustomers.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-100 px-4 py-3">
                      <p className="text-xs font-semibold text-slate-500">Top Customers</p>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-400">
                          <th className="px-4 py-2">Rank</th>
                          <th className="px-4 py-2">Name</th>
                          <th className="px-4 py-2">Spend</th>
                          <th className="px-4 py-2">Points</th>
                          <th className="px-4 py-2">Tier</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {report.content.topCustomers.map((c, i) => (
                          <tr key={c.id}>
                            <td className="px-4 py-2">{i === 0 ? '👑' : `#${i + 1}`}</td>
                            <td className="px-4 py-2 font-medium text-slate-800">{c.fullName}</td>
                            <td className="px-4 py-2 text-slate-600">₦{c.totalSpend.toLocaleString()}</td>
                            <td className="px-4 py-2 text-slate-600">⭐ {c.pointsBalance.toLocaleString()}</td>
                            <td className="px-4 py-2">
                              {c.tierLabel ? (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{c.tierLabel}</span>
                              ) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Category breakdown */}
                {report.content.categoryBreakdown.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="mb-3 text-xs font-semibold text-slate-500">Category Breakdown</p>
                    <div className="space-y-2">
                      {report.content.categoryBreakdown.map((cat, i) => (
                        <div key={cat.name}>
                          <div className="mb-0.5 flex justify-between text-xs text-slate-600">
                            <span>{cat.name}</span>
                            <span>{cat.percentage}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${cat.percentage}%`, backgroundColor: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length] }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </section>

        {/* ── SECTION 6: Export ────────────────────────────────────────────── */}
        <section data-testid="export-section">
          <SectionTitle>Export & Share Report</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-3">
            {/* PDF */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 text-center">
              <p className="mb-1 text-3xl">📋</p>
              <p className="mb-1 font-semibold text-slate-800">Monthly Summary PDF</p>
              <button
                onClick={() => void downloadFile('reports/pdf', `report-${period}.pdf`)}
                className="mt-3 rounded-lg bg-[#0F1E35] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a3050]"
                data-testid="pdf-download-btn"
              >
                ⬇ Download PDF
              </button>
            </div>

            {/* Excel */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 text-center">
              <p className="mb-1 text-3xl">📊</p>
              <p className="mb-1 font-semibold text-slate-800">Raw Data Excel</p>
              <button
                onClick={() => void downloadFile('reports/excel', `report-${period}.xlsx`)}
                className="mt-3 rounded-lg bg-[#0F1E35] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a3050]"
                data-testid="excel-download-btn"
              >
                ⬇ Download Excel
              </button>
            </div>

            {/* Email schedule */}
            <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="schedule-card">
              <p className="mb-1 text-3xl">📧</p>
              <p className="mb-2 font-semibold text-slate-800">Monthly Email Report</p>
              {schedule?.isActive ? (
                <div>
                  <p className="mb-2 text-xs text-slate-500">Sending to <span className="font-medium">{schedule.email}</span> monthly</p>
                  <button
                    onClick={() => void handleCancelSchedule()}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    data-testid="cancel-schedule-btn"
                  >
                    Cancel
                  </button>
                </div>
              ) : scheduleMsg ? (
                <p className="text-sm text-green-600">{scheduleMsg}</p>
              ) : (
                <div className="space-y-2">
                  <input
                    type="email"
                    value={scheduleEmail}
                    onChange={(e) => setScheduleEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    data-testid="schedule-email-input"
                  />
                  <button
                    onClick={() => void handleSchedule()}
                    disabled={!scheduleEmail}
                    className="w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-green-700"
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
