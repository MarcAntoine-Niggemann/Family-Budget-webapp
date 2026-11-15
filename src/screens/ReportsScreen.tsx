import React, { useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  PieChart,
  Calendar,
  DollarSign,
  Users,
  Flame,
  Award,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  ArrowUpRight
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { computeMonthlyReport, computeYearlyReport } from '../utils/reportEngine';
import { CategoryIcon } from '../components/CategoryIcon';

export const ReportsScreen: React.FC = () => {
  const {
    transactions,
    categories,
    budgets,
    members,
    currency,
    language,
    drillDownToTransactions
  } = useBudget();
  const isFr = language === 'fr';

  const [activeTab, setActiveTab] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [burnDownMode, setBurnDownMode] = useState<'EXPENSE' | 'NET'>('EXPENSE');
  const [selectedBurnDay, setSelectedBurnDay] = useState<number | null>(null);
  const [expandedMonthlyCats, setExpandedMonthlyCats] = useState<Record<number, boolean>>({});
  const [expandedYearlyCats, setExpandedYearlyCats] = useState<Record<number, boolean>>({});

  const toggleMonthlyCat = (catId: number) => {
    setExpandedMonthlyCats(prev => ({
      ...prev,
      [catId]: !(prev[catId] ?? true)
    }));
  };

  const toggleYearlyCat = (catId: number) => {
    setExpandedYearlyCats(prev => ({
      ...prev,
      [catId]: !(prev[catId] ?? true)
    }));
  };

  const monthlyReport = computeMonthlyReport(
    selectedYear,
    selectedMonth,
    transactions,
    categories,
    budgets,
    members,
    language
  );

  const yearlyReport = computeYearlyReport(selectedYear, transactions, categories, budgets, language);

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const monthDateFrom = `${selectedYear}-${pad2(selectedMonth + 1)}-01`;
  const monthLastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const monthDateTo = `${selectedYear}-${pad2(selectedMonth + 1)}-${pad2(monthLastDay)}`;
  const yearDateFrom = `${selectedYear}-01-01`;
  const yearDateTo = `${selectedYear}-12-31`;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Controls Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {isFr ? 'Rapports & Analyses Financières' : 'Financial Reports & Analytics'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {isFr
              ? 'Suivi budgétaire, taux d’épargne, ventilation par catégorie et par membre'
              : 'Budget tracking, savings rate, category and member breakdown'}
          </p>
        </div>

        {/* Tab Switcher & Period Picker */}
        <div className="flex items-center gap-2">
          <div className="grid grid-cols-2 p-1 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setActiveTab('MONTHLY')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap shrink-0 ${
                activeTab === 'MONTHLY'
                  ? 'bg-teal-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isFr ? 'Mensuel' : 'Monthly'}
            </button>
            <button
              onClick={() => setActiveTab('YEARLY')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap shrink-0 ${
                activeTab === 'YEARLY'
                  ? 'bg-teal-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isFr ? 'Annuel' : 'Annual'}
            </button>
          </div>

          {activeTab === 'MONTHLY' && (
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
              <button
                onClick={() => {
                  setSelectedBurnDay(null);
                  if (selectedMonth === 0) {
                    setSelectedMonth(11);
                    setSelectedYear(y => y - 1);
                  } else {
                    setSelectedMonth(m => m - 1);
                  }
                }}
                className="px-2 py-1 text-slate-400 hover:text-slate-200"
              >
                ←
              </button>
              <span className="px-2 font-semibold text-slate-200 capitalize whitespace-nowrap">
                {monthlyReport.monthName}
              </span>
              <button
                onClick={() => {
                  setSelectedBurnDay(null);
                  if (selectedMonth === 11) {
                    setSelectedMonth(0);
                    setSelectedYear(y => y + 1);
                  } else {
                    setSelectedMonth(m => m + 1);
                  }
                }}
                className="px-2 py-1 text-slate-400 hover:text-slate-200"
              >
                →
              </button>
            </div>
          )}

          {activeTab === 'YEARLY' && (
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
              <button
                onClick={() => setSelectedYear(y => y - 1)}
                className="px-2 py-1 text-slate-400 hover:text-slate-200"
              >
                ←
              </button>
              <span className="px-2 font-semibold text-slate-200">{selectedYear}</span>
              <button
                onClick={() => setSelectedYear(y => y + 1)}
                className="px-2 py-1 text-slate-400 hover:text-slate-200"
              >
                →
              </button>
            </div>
          )}
        </div>
      </div>

      {activeTab === 'MONTHLY' ? (
        /* MONTHLY VIEW */
        <div className="space-y-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Total Spent */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                {isFr ? 'Dépenses Réelles' : 'Total Spent'}
              </span>
              <div className="mt-2 text-2xl font-bold text-white font-mono tabular-nums">
                {monthlyReport.totalActualExpenses.toLocaleString()} {currency}
              </div>
              <span className="text-xs text-slate-400 mt-1 block font-mono tabular-nums">
                {isFr ? 'Budget :' : 'Budget:'}{' '}
                {monthlyReport.totalExpenseBudget.toLocaleString()} {currency}
              </span>
            </div>

            {/* Total Income */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                {isFr ? 'Revenus Réels' : 'Total Income'}
              </span>
              <div className="mt-2 text-2xl font-bold text-emerald-400 font-mono tabular-nums">
                {monthlyReport.totalActualIncome.toLocaleString()} {currency}
              </div>
              <span className="text-xs text-slate-400 mt-1 block font-mono tabular-nums">
                {isFr ? 'Objectif :' : 'Target:'}{' '}
                {monthlyReport.totalIncomeBudget.toLocaleString()} {currency}
              </span>
            </div>

            {/* Net Savings */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                {isFr ? 'Épargne Nette' : 'Net Savings'}
              </span>
              <div
                className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
                  monthlyReport.netSavings >= 0 ? 'text-teal-400' : 'text-rose-400'
                }`}
              >
                {monthlyReport.netSavings >= 0 ? '+' : ''}
                {monthlyReport.netSavings.toLocaleString()} {currency}
              </div>
              <span className="text-xs text-slate-400 mt-1 block font-mono tabular-nums">
                {isFr ? 'Écart budget :' : 'Budget diff:'}{' '}
                {monthlyReport.netBudgetDifference.toLocaleString()} {currency}
              </span>
            </div>

            {/* Savings Rate */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                {isFr ? 'Taux d’Épargne' : 'Savings Rate'}
              </span>
              <div className="mt-2 text-2xl font-bold text-indigo-400 font-mono tabular-nums">
                {monthlyReport.savingsRate}%
              </div>
              <span className="text-xs text-slate-400 mt-1 block">
                {monthlyReport.savingsRate >= 20
                  ? isFr
                    ? 'Excellent objectif atteint'
                    : 'Great goal achieved'
                  : isFr
                  ? 'Objectif recommandé : 20%'
                  : 'Target standard: 20%'}
              </span>
            </div>
          </div>

          {/* Burn Down Curve Card */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400 shrink-0" />
                  <h3 className="font-bold text-white text-sm">
                    {burnDownMode === 'EXPENSE'
                      ? isFr
                        ? 'Courbe d’Épuisement Budgétaire (Burn-Down)'
                        : 'Budget Burn-Down Curve (Remaining)'
                      : isFr
                      ? 'Trajectoire Budgétaire Nette (Revenus − Dépenses)'
                      : 'Net Budget Trajectory (Income vs. Spending)'}
                  </h3>
                </div>
                <p className="text-[11px] text-slate-400">
                  {burnDownMode === 'EXPENSE'
                    ? isFr
                      ? 'Reste budgétaire de 100 % vers 0 selon les échéances datées et allocations réparties du mois'
                      : 'Remaining allowance from 100% down to zero, factoring due dates and spread monthly budgets'
                    : isFr
                    ? 'Solde cumulé du mois intégrant le calendrier des revenus et des dépenses prévues'
                    : 'Cumulative monthly net position factoring scheduled income and spending dates'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Mode Toggle: Expense Burn-Down vs Net (Income vs Spending) */}
                <div className="grid grid-cols-2 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setBurnDownMode('EXPENSE')}
                    className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap shrink-0 ${
                      burnDownMode === 'EXPENSE'
                        ? 'bg-teal-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isFr ? 'Dépenses' : 'Expenses'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBurnDownMode('NET')}
                    className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap shrink-0 ${
                      burnDownMode === 'NET'
                        ? 'bg-teal-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isFr ? 'Net (Rev. − Dép.)' : 'Net (Inc. − Exp.)'}
                  </button>
                </div>

                <div className="flex items-center gap-4 text-xs font-medium">
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <span className="w-4 border-t-2 border-dashed border-slate-400" />
                    {isFr ? 'Idéal planifié' : 'Planned Ideal'}
                  </span>
                  <span className="flex items-center gap-1.5 text-teal-400">
                    <span className="w-4 h-0.5 bg-teal-400" />
                    {isFr ? 'Réalisé' : 'Actual'}
                  </span>
                </div>
              </div>
            </div>

            {(() => {
              const pts = monthlyReport.burnDownPoints;
              if (pts.length < 2) return null;

              const hasAnyBudget =
                monthlyReport.totalExpenseBudget > 0 || monthlyReport.totalIncomeBudget > 0;

              if (!hasAnyBudget && monthlyReport.totalActualExpenses === 0 && monthlyReport.totalActualIncome === 0) {
                return (
                  <div className="py-10 text-center text-xs text-slate-500">
                    {isFr
                      ? 'Aucun budget actif ou transaction enregistrée sur cette période.'
                      : 'No active budgets or recorded transactions for this period.'}
                  </div>
                );
              }

              const getIdeal = (p: (typeof pts)[number]) =>
                burnDownMode === 'EXPENSE' ? p.idealExpense : p.idealNet;
              const getActual = (p: (typeof pts)[number]) =>
                burnDownMode === 'EXPENSE' ? p.actualExpense : p.actualNet;

              const allValues: number[] = [];
              for (const p of pts) {
                allValues.push(getIdeal(p));
                const act = getActual(p);
                if (act !== null) allValues.push(act);
              }
              allValues.push(0);

              const rawMin = Math.min(...allValues);
              const rawMax = Math.max(...allValues);
              const span = rawMax - rawMin || 100;
              const minVal = rawMin < 0 ? rawMin - span * 0.05 : 0;
              const maxVal = rawMax + span * 0.05;
              const range = maxVal - minVal || 1;

              const width = 760;
              const height = 200;
              const padX = 12;
              const padY = 14;

              const toX = (idx: number) =>
                padX + (idx / Math.max(1, pts.length - 1)) * (width - 2 * padX);
              const toY = (val: number) =>
                height - padY - ((val - minVal) / range) * (height - 2 * padY);

              const idealCoords = pts.map((p, idx) => ({
                x: toX(idx),
                y: toY(getIdeal(p)),
                p,
                idx
              }));

              const idealPath =
                `M ${idealCoords[0].x},${idealCoords[0].y} ` +
                idealCoords
                  .slice(1)
                  .map(c => `L ${c.x},${c.y}`)
                  .join(' ');

              const actualPoints = pts
                .map((p, idx) => {
                  const val = getActual(p);
                  if (val === null) return null;
                  return { x: toX(idx), y: toY(val), val, p, idx };
                })
                .filter((x): x is NonNullable<typeof x> => x !== null);

              const actualPath =
                actualPoints.length >= 1
                  ? `M ${actualPoints[0].x},${actualPoints[0].y} ` +
                    actualPoints
                      .slice(1)
                      .map(c => `L ${c.x},${c.y}`)
                      .join(' ')
                  : '';

              const zeroY = toY(0);
              const actualArea =
                actualPoints.length >= 2
                  ? `${actualPath} L ${actualPoints[actualPoints.length - 1].x},${zeroY} L ${actualPoints[0].x},${zeroY} Z`
                  : '';

              const lastActual = actualPoints[actualPoints.length - 1] || null;
              const activeDayIdx =
                selectedBurnDay !== null && pts[selectedBurnDay]
                  ? selectedBurnDay
                  : lastActual
                  ? lastActual.idx
                  : pts.length - 1;
              const activePt = pts[activeDayIdx];
              const activeIdealVal = getIdeal(activePt);
              const activeActualVal = getActual(activePt);
              const activeVariance =
                activeActualVal !== null
                  ? Math.round((activeActualVal - activeIdealVal) * 100) / 100
                  : null;

              const stepW = (width - 2 * padX) / Math.max(1, pts.length - 1);

              return (
                <div className="space-y-3">
                  <div className="flex gap-2 items-stretch">
                    {/* Y-Axis Scale Labels */}
                    <div className="flex flex-col justify-between text-[10px] font-mono tabular-nums text-slate-500 py-2 text-right min-w-[56px] shrink-0">
                      <span>
                        {Math.round(maxVal).toLocaleString()} {currency}
                      </span>
                      {minVal < 0 && <span>0 {currency}</span>}
                      <span>
                        {Math.round(minVal).toLocaleString()} {currency}
                      </span>
                    </div>

                    {/* SVG Chart */}
                    <div className="relative h-48 flex-1 select-none">
                      <svg
                        className="w-full h-full overflow-visible"
                        preserveAspectRatio="none"
                        viewBox={`0 0 ${width} ${height}`}
                      >
                        <defs>
                          <linearGradient id="actualBurnGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.28" />
                            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>

                        {/* Reference grid lines */}
                        <line
                          x1={padX}
                          y1={height * 0.25}
                          x2={width - padX}
                          y2={height * 0.25}
                          stroke="#1e293b"
                          strokeDasharray="3 3"
                        />
                        <line
                          x1={padX}
                          y1={height * 0.5}
                          x2={width - padX}
                          y2={height * 0.5}
                          stroke="#1e293b"
                          strokeDasharray="3 3"
                        />
                        <line
                          x1={padX}
                          y1={height * 0.75}
                          x2={width - padX}
                          y2={height * 0.75}
                          stroke="#1e293b"
                          strokeDasharray="3 3"
                        />

                        {/* Zero baseline */}
                        {zeroY >= padY - 2 && zeroY <= height - padY + 2 && (
                          <line
                            x1={padX}
                            y1={zeroY}
                            x2={width - padX}
                            y2={zeroY}
                            stroke={minVal < 0 ? '#f43f5e' : '#334155'}
                            strokeWidth="1.2"
                            strokeDasharray="4 4"
                          />
                        )}

                        {/* Actual area & curve */}
                        {actualArea && <path d={actualArea} fill="url(#actualBurnGrad)" />}
                        {/* Schedule-aware ideal line */}
                        <path
                          d={idealPath}
                          stroke="#94a3b8"
                          strokeWidth="1.75"
                          strokeDasharray="5 4"
                          fill="none"
                        />
                        {actualPath && (
                          <path
                            d={actualPath}
                            stroke="#2dd4bf"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                          />
                        )}

                        {/* Scheduled budget milestone dots on ideal curve */}
                        {idealCoords.map(c => {
                          if (c.p.scheduledEvents.length === 0) return null;
                          const hasIncome = c.p.scheduledEvents.some(e => !e.isExpense);
                          const hasExpense = c.p.scheduledEvents.some(e => e.isExpense);
                          if (burnDownMode === 'EXPENSE' && !hasExpense) return null;
                          return (
                            <circle
                              key={`ev_${c.idx}`}
                              cx={c.x}
                              cy={c.y}
                              r="3.2"
                              fill={hasIncome && burnDownMode === 'NET' ? '#10b981' : '#f59e0b'}
                              stroke="#0f172a"
                              strokeWidth="1.5"
                            />
                          );
                        })}

                        {/* Current tracked actual point */}
                        {lastActual && (
                          <circle
                            cx={lastActual.x}
                            cy={lastActual.y}
                            r="4.2"
                            fill="#2dd4bf"
                            stroke="#0f172a"
                            strokeWidth="1.5"
                          />
                        )}

                        {/* Active scrubber highlight */}
                        {idealCoords[activeDayIdx] && (
                          <line
                            x1={idealCoords[activeDayIdx].x}
                            y1={padY}
                            x2={idealCoords[activeDayIdx].x}
                            y2={height - padY}
                            stroke="#38bdf8"
                            strokeWidth="1.2"
                            strokeDasharray="2 2"
                          />
                        )}

                        {/* Interactive hover/tap columns */}
                        {idealCoords.map(c => (
                          <rect
                            key={`hit_${c.idx}`}
                            x={c.x - stepW / 2}
                            y={0}
                            width={Math.max(8, stepW)}
                            height={height}
                            fill="transparent"
                            className="cursor-pointer"
                            onMouseEnter={() => setSelectedBurnDay(c.idx)}
                            onClick={() => setSelectedBurnDay(c.idx)}
                          />
                        ))}
                      </svg>
                    </div>
                  </div>

                  {/* X-Axis Day Markers */}
                  <div className="flex justify-between text-[10px] font-mono tabular-nums text-slate-500 pl-16">
                    <span>{isFr ? 'Début' : 'Start'}</span>
                    <span>{isFr ? 'J10' : 'Day 10'}</span>
                    <span>{isFr ? 'J20' : 'Day 20'}</span>
                    <span>
                      {isFr ? `J${pts[pts.length - 1].day}` : `Day ${pts[pts.length - 1].day}`}
                    </span>
                  </div>

                  {/* Inspected Day Readout Bar */}
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums">
                      <span className="font-sans font-semibold text-white">
                        {activePt.day === 0
                          ? isFr
                            ? 'Début du mois'
                            : 'Start of month'
                          : isFr
                          ? `Jour ${activePt.day}`
                          : `Day ${activePt.day}`}
                      </span>
                      <span className="text-slate-400">
                        {isFr ? 'Idéal :' : 'Ideal:'}{' '}
                        <strong className="text-slate-200">
                          {activeIdealVal.toLocaleString()} {currency}
                        </strong>
                      </span>
                      {activeActualVal !== null && (
                        <span className="text-slate-400">
                          {isFr ? 'Réel :' : 'Actual:'}{' '}
                          <strong
                            className={
                              activeActualVal >= 0 ? 'text-teal-300' : 'text-rose-400'
                            }
                          >
                            {activeActualVal.toLocaleString()} {currency}
                          </strong>
                        </span>
                      )}
                      {activeVariance !== null && (
                        <span
                          className={`font-semibold ${
                            activeVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          ({activeVariance >= 0 ? '+' : ''}
                          {activeVariance.toLocaleString()} {currency})
                        </span>
                      )}
                    </div>

                    {activePt.scheduledEvents.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                        {activePt.scheduledEvents
                          .filter(ev => (burnDownMode === 'EXPENSE' ? ev.isExpense : true))
                          .map((ev, eIdx) => (
                            <span key={eIdx} className="font-mono tabular-nums">
                              <span className="font-sans text-slate-400">{ev.title}:</span>{' '}
                              <span className={ev.isExpense ? 'text-amber-300' : 'text-emerald-400'}>
                                {ev.amount > 0 ? '+' : ''}
                                {ev.amount.toLocaleString()} {currency}
                              </span>
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Category Breakdown & Member Share Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Category & Sub-Category Spend Distribution (2 cols) */}
            <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-white text-sm">
                  {isFr ? 'Répartition par Catégorie & Sous-catégorie' : 'Category & Sub-Category Breakdown'}
                </h3>
                <span className="text-[11px] text-slate-500">
                  {isFr ? 'Cliquer pour déplier ou filtrer' : 'Click to expand or drill down'}
                </span>
              </div>

              <div className="space-y-3">
                {monthlyReport.categories.map(cat => {
                  const isExpanded = expandedMonthlyCats[cat.categoryId] ?? true;
                  const visibleSubs = cat.subCategories.filter(
                    sub =>
                      sub.budgetAmount > 0 ||
                      sub.actualAmount !== 0 ||
                      sub.grossExpense > 0 ||
                      sub.grossIncome > 0
                  );

                  return (
                    <div
                      key={cat.categoryId}
                      className="rounded-xl bg-slate-950/50 border border-slate-800/70 p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => toggleMonthlyCat(cat.categoryId)}
                          className="flex-1 min-w-0 text-left space-y-1.5 cursor-pointer"
                        >
                          <div className="flex items-center justify-between text-xs gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {visibleSubs.length > 0 ? (
                                isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                )
                              ) : (
                                <span className="w-3.5 shrink-0" />
                              )}
                              <CategoryIcon name={cat.categoryIcon} className="w-4 h-4 text-slate-300 shrink-0" />
                              <span className="font-semibold text-slate-100 truncate">
                                {cat.categoryName}
                              </span>
                              {cat.actualIncome > 0 && (
                                <span className="text-[10px] font-mono tabular-nums text-emerald-400">
                                  +{cat.actualIncome.toLocaleString()} {currency}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                              <span className="font-bold text-white">
                                {cat.actualSpent.toLocaleString()} {currency}
                              </span>
                              <span className="text-slate-500">
                                / {cat.budgetExpense.toLocaleString()} {currency}
                              </span>
                              <span
                                className={`font-semibold text-[11px] ${
                                  cat.isOverBudget ? 'text-rose-400' : 'text-teal-400'
                                }`}
                              >
                                ({cat.percentageUsed}%)
                              </span>
                            </div>
                          </div>

                          <div className="w-full h-1.5 rounded-full bg-slate-900 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                cat.isOverBudget ? 'bg-rose-500' : 'bg-teal-500'
                              }`}
                              style={{ width: `${Math.min(100, cat.percentageUsed)}%` }}
                            />
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            drillDownToTransactions({
                              dateFrom: monthDateFrom,
                              dateTo: monthDateTo,
                              categoryId: cat.categoryId,
                              budgetId: 'ALL'
                            })
                          }
                          title={
                            isFr
                              ? 'Voir les opérations de cette catégorie'
                              : 'View transactions for this category'
                          }
                          className="p-1 rounded-lg text-slate-400 hover:text-teal-300 hover:bg-slate-800/80 transition shrink-0 cursor-pointer"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {isExpanded && visibleSubs.length > 0 && (
                        <div className="pl-6 pt-1 space-y-1.5 border-t border-slate-800/60">
                          {visibleSubs.map(sub => (
                            <button
                              key={sub.budgetId}
                              type="button"
                              onClick={() =>
                                drillDownToTransactions({
                                  dateFrom: monthDateFrom,
                                  dateTo: monthDateTo,
                                  categoryId: cat.categoryId,
                                  budgetId: sub.budgetId
                                })
                              }
                              title={
                                isFr
                                  ? 'Voir les opérations de cette sous-catégorie'
                                  : 'View transactions for this sub-category'
                              }
                              className="w-full text-left space-y-1 rounded-lg px-2 py-1 -mx-2 hover:bg-slate-800/60 transition cursor-pointer group/sub"
                            >
                              <div className="flex items-center justify-between text-[11px] gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-slate-300 group-hover/sub:text-teal-300 transition truncate">
                                    {sub.title}
                                  </span>
                                  <ArrowUpRight className="w-3 h-3 text-slate-600 group-hover/sub:text-teal-300 transition shrink-0" />
                                  {!sub.isExpense && (
                                    <span className="text-[10px] font-semibold text-emerald-400 uppercase">
                                      {isFr ? 'Revenu' : 'Income'}
                                    </span>
                                  )}
                                </div>
                                  <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                                    <span
                                      className={
                                        sub.isExpense
                                          ? sub.actualAmount < 0
                                            ? 'font-semibold text-emerald-400'
                                            : 'font-semibold text-slate-200'
                                          : 'font-semibold text-emerald-400'
                                      }
                                    >
                                      {sub.actualAmount.toLocaleString()} {currency}
                                    </span>
                                    <span className="text-slate-500">
                                      / {sub.budgetAmount.toLocaleString()} {currency}
                                    </span>
                                    <span
                                      className={
                                        sub.isExpense
                                          ? sub.isOverBudget
                                            ? 'text-rose-400'
                                            : 'text-teal-400'
                                          : 'text-emerald-400'
                                      }
                                    >
                                      {sub.percentageUsed}%
                                    </span>
                                  </div>
                                </div>
                                {sub.offsetAmount > 0 && (
                                  <div className="text-[10px] font-mono tabular-nums text-teal-300/80">
                                    {sub.isExpense
                                      ? isFr
                                        ? `Dép. ${sub.grossExpense.toLocaleString()} − Crédits ${sub.grossIncome.toLocaleString()} ${currency}`
                                        : `Spent ${sub.grossExpense.toLocaleString()} − Credits ${sub.grossIncome.toLocaleString()} ${currency}`
                                      : isFr
                                      ? `Reçus ${sub.grossIncome.toLocaleString()} − Débits ${sub.grossExpense.toLocaleString()} ${currency}`
                                      : `Income ${sub.grossIncome.toLocaleString()} − Debits ${sub.grossExpense.toLocaleString()} ${currency}`}
                                  </div>
                                )}
                              <div className="w-full h-1 rounded-full bg-slate-900 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    !sub.isExpense
                                      ? 'bg-emerald-500'
                                      : sub.isOverBudget
                                      ? 'bg-rose-500'
                                      : 'bg-teal-500/80'
                                  }`}
                                  style={{ width: `${Math.min(100, sub.percentageUsed)}%` }}
                                />
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {(monthlyReport.unassignedExpenses > 0 || monthlyReport.unassignedIncome > 0) && (
                <button
                  type="button"
                  onClick={() =>
                    drillDownToTransactions({
                      dateFrom: monthDateFrom,
                      dateTo: monthDateTo,
                      categoryId: 'UNASSIGNED',
                      budgetId: 'ALL'
                    })
                  }
                  className="w-full pt-2 border-t border-slate-800 flex items-center justify-between gap-2 text-xs text-amber-300 hover:text-amber-200 transition cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {isFr
                        ? 'Opérations non catégorisées sur la période'
                        : 'Unassigned transactions in period'}
                    </span>
                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                  </span>
                  <span className="font-mono tabular-nums font-semibold">
                    {monthlyReport.unassignedExpenses > 0 &&
                      `-${monthlyReport.unassignedExpenses.toLocaleString()} ${currency}`}
                    {monthlyReport.unassignedExpenses > 0 && monthlyReport.unassignedIncome > 0 && ' · '}
                    {monthlyReport.unassignedIncome > 0 &&
                      `+${monthlyReport.unassignedIncome.toLocaleString()} ${currency}`}
                  </span>
                </button>
              )}
            </div>

            {/* Member Spending Share (1 col) */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-teal-400" />
                <h3 className="font-bold text-white text-sm">
                  {isFr ? 'Dépenses par Membre' : 'By Family Member'}
                </h3>
              </div>

              <div className="space-y-3">
                {monthlyReport.members.map(m => (
                  <div key={m.memberId} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ backgroundColor: `#${m.avatarColor.toString(16).slice(-6)}` }}
                        >
                          {m.memberName.charAt(0)}
                        </div>
                        <span className="text-slate-200">{m.memberName}</span>
                      </div>
                      <span className="text-white font-bold">
                        {m.amount.toLocaleString()} {currency}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-900 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-teal-500"
                          style={{ width: `${m.percentage}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">{m.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* YEARLY VIEW */
        <div className="space-y-6">
          {/* Annual Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 block">
                {isFr ? 'Budget Annuel Total' : 'Total Annual Budget'}
              </span>
              <div className="mt-1 text-2xl font-bold text-white font-mono tabular-nums">
                {yearlyReport.totalAnnualBudget.toLocaleString()} {currency}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 block">
                {isFr ? 'Dépensé sur l’Année (YTD)' : 'Year-to-Date Spent'}
              </span>
              <div className="mt-1 text-2xl font-bold text-slate-100 font-mono tabular-nums">
                {yearlyReport.totalAnnualSpent.toLocaleString()} {currency}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 block">
                {isFr ? 'Revenus Annuels Réalisés' : 'Annual Income Received'}
              </span>
              <div className="mt-1 text-2xl font-bold text-emerald-400 font-mono tabular-nums">
                {yearlyReport.totalAnnualIncome.toLocaleString()} {currency}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 block">
                {isFr ? 'Solde Budgétaire Annuel' : 'Remaining Annual Allowance'}
              </span>
              <div
                className={`mt-1 text-2xl font-bold font-mono tabular-nums ${
                  yearlyReport.remainingAnnualBudget >= 0 ? 'text-teal-400' : 'text-rose-400'
                }`}
              >
                {yearlyReport.remainingAnnualBudget.toLocaleString()} {currency}
              </div>
            </div>
          </div>

          {/* 12 Months Matrix Table */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 font-bold text-sm text-white">
              {isFr ? 'Historique & Budget Prévu Mois par Mois' : 'Month-by-Month Actual vs. Planned Matrix'}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">{isFr ? 'Mois' : 'Month'}</th>
                    <th className="py-3 px-4 text-right">{isFr ? 'Revenus' : 'Income'}</th>
                    <th className="py-3 px-4 text-right">{isFr ? 'Dépenses Réelles' : 'Actual Expenses'}</th>
                    <th className="py-3 px-4 text-right">{isFr ? 'Budget Prévu' : 'Planned Budget'}</th>
                    <th className="py-3 px-4 text-right">{isFr ? 'Solde / Épargne' : 'Net Savings'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {yearlyReport.monthlyBreakdown.map(m => (
                    <tr key={m.monthIndex} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 text-slate-200 capitalize">{m.monthName}</td>
                      <td className="py-3 px-4 text-right text-emerald-400 font-mono tabular-nums">
                        {m.income > 0 ? `+${m.income.toLocaleString()}` : '0'} {currency}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums ${
                          m.plannedExpenses > 0 && m.expenses > m.plannedExpenses
                            ? 'text-rose-400 font-semibold'
                            : 'text-slate-100'
                        }`}
                      >
                        {m.expenses.toLocaleString()} {currency}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400 font-mono tabular-nums">
                        {m.plannedExpenses.toLocaleString()} {currency}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold font-mono tabular-nums ${
                          m.savings >= 0 ? 'text-teal-400' : 'text-rose-400'
                        }`}
                      >
                        {m.savings >= 0 ? '+' : ''}
                        {m.savings.toLocaleString()} {currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Annual Category & Sub-Category Breakdown */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-white text-sm">
                {isFr
                  ? `Détail Annuel par Catégorie & Sous-catégorie (${selectedYear})`
                  : `Annual Category & Sub-Category Breakdown (${selectedYear})`}
              </h3>
              <span className="text-[11px] text-slate-500">
                {isFr ? 'Cliquer pour déplier ou filtrer' : 'Click to expand or drill down'}
              </span>
            </div>

            <div className="space-y-3">
              {yearlyReport.categoryBreakdown.map(cat => {
                const isExpanded = expandedYearlyCats[cat.categoryId] ?? false;
                const isOver = cat.annualSpent > cat.annualBudget && cat.annualBudget > 0;
                return (
                  <div
                    key={cat.categoryId}
                    className="rounded-xl bg-slate-950/50 border border-slate-800/70 p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleYearlyCat(cat.categoryId)}
                        className="flex-1 min-w-0 text-left space-y-1.5 cursor-pointer"
                      >
                        <div className="flex items-center justify-between text-xs gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {cat.subCategories.length > 0 ? (
                              isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              )
                            ) : (
                              <span className="w-3.5 shrink-0" />
                            )}
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: `#${cat.categoryColor.toString(16).slice(-6)}` }}
                            />
                            <span className="font-semibold text-slate-100 truncate">
                              {cat.categoryName}
                            </span>
                            <span className="text-[11px] text-slate-500 shrink-0">
                              ({cat.subCategories.length}{' '}
                              {isFr ? 'sous-cat.' : 'sub-cat.'})
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                            <span className="font-bold text-white">
                              {cat.annualSpent.toLocaleString()} {currency}
                            </span>
                            <span className="text-slate-500">
                              / {cat.annualBudget.toLocaleString()} {currency}
                            </span>
                            <span
                              className={`font-semibold text-[11px] ${
                                isOver ? 'text-rose-400' : 'text-teal-400'
                              }`}
                            >
                              ({cat.percentageUsed}%)
                            </span>
                          </div>
                        </div>

                        <div className="w-full h-1.5 rounded-full bg-slate-900 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isOver ? 'bg-rose-500' : 'bg-teal-500'}`}
                            style={{ width: `${Math.min(100, cat.percentageUsed)}%` }}
                          />
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          drillDownToTransactions({
                            dateFrom: yearDateFrom,
                            dateTo: yearDateTo,
                            categoryId: cat.categoryId,
                            budgetId: 'ALL'
                          })
                        }
                        title={
                          isFr
                            ? 'Voir les opérations annuelles de cette catégorie'
                            : 'View annual transactions for this category'
                        }
                        className="p-1 rounded-lg text-slate-400 hover:text-teal-300 hover:bg-slate-800/80 transition shrink-0 cursor-pointer"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {isExpanded && cat.subCategories.length > 0 && (
                      <div className="pl-6 pt-1 space-y-1.5 border-t border-slate-800/60">
                        {cat.subCategories.map(sub => {
                          const subOver = sub.annualActual > sub.annualBudget && sub.annualBudget > 0;
                          return (
                            <button
                              key={sub.budgetId}
                              type="button"
                              onClick={() =>
                                drillDownToTransactions({
                                  dateFrom: yearDateFrom,
                                  dateTo: yearDateTo,
                                  categoryId: cat.categoryId,
                                  budgetId: sub.budgetId
                                })
                              }
                              title={
                                isFr
                                  ? 'Voir les opérations annuelles de cette sous-catégorie'
                                  : 'View annual transactions for this sub-category'
                              }
                              className="w-full flex items-center justify-between text-[11px] gap-2 rounded-lg px-2 py-1 -mx-2 hover:bg-slate-800/60 transition cursor-pointer group/sub"
                            >
                              <span className="flex items-center gap-1.5 min-w-0">
                                <span className="text-slate-300 group-hover/sub:text-teal-300 transition truncate">
                                  {sub.title}
                                </span>
                                {sub.offsetAmount > 0 && (
                                  <span className="text-[10px] font-mono tabular-nums text-teal-300/80 truncate">
                                    ({sub.grossExpense.toLocaleString()} − {sub.grossIncome.toLocaleString()})
                                  </span>
                                )}
                                <ArrowUpRight className="w-3 h-3 text-slate-600 group-hover/sub:text-teal-300 transition shrink-0" />
                              </span>
                              <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                                <span
                                  className={`font-semibold ${
                                    sub.annualActual < 0 ? 'text-emerald-400' : 'text-slate-200'
                                  }`}
                                >
                                  {sub.annualActual.toLocaleString()} {currency}
                                </span>
                                <span className="text-slate-500">
                                  / {sub.annualBudget.toLocaleString()} {currency}
                                </span>
                                <span className={subOver ? 'text-rose-400' : 'text-teal-400'}>
                                  {sub.percentageUsed}%
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {yearlyReport.unassignedExpenses > 0 && (
              <button
                type="button"
                onClick={() =>
                  drillDownToTransactions({
                    dateFrom: yearDateFrom,
                    dateTo: yearDateTo,
                    categoryId: 'UNASSIGNED',
                    budgetId: 'ALL'
                  })
                }
                className="w-full pt-2 border-t border-slate-800 flex items-center justify-between gap-2 text-xs text-amber-300 hover:text-amber-200 transition cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isFr
                      ? 'Dépenses non catégorisées sur l’année'
                      : 'Unassigned expenses in year'}
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                </span>
                <span className="font-mono tabular-nums font-semibold">
                  -{yearlyReport.unassignedExpenses.toLocaleString()} {currency}
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
