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
  Award
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { computeMonthlyReport, computeYearlyReport } from '../utils/reportEngine';
import { CategoryIcon } from '../components/CategoryIcon';

export const ReportsScreen: React.FC = () => {
  const { transactions, categories, budgets, members, currency, language } = useBudget();
  const isFr = language === 'fr';

  const [activeTab, setActiveTab] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());

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
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === 'MONTHLY'
                  ? 'bg-teal-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isFr ? 'Mensuel' : 'Monthly'}
            </button>
            <button
              onClick={() => setActiveTab('YEARLY')}
              className={`px-3 py-1.5 rounded-lg transition ${
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
              <span className="px-2 font-semibold text-slate-200 capitalize">
                {monthlyReport.monthName}
              </span>
              <button
                onClick={() => {
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
              <div className="mt-2 text-2xl font-bold text-white">
                {monthlyReport.totalActualExpenses.toLocaleString()} {currency}
              </div>
              <span className="text-xs text-slate-400 mt-1 block">
                {isFr ? 'Budget :' : 'Budget:'}{' '}
                {monthlyReport.totalExpenseBudget.toLocaleString()} {currency}
              </span>
            </div>

            {/* Total Income */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                {isFr ? 'Revenus Réels' : 'Total Income'}
              </span>
              <div className="mt-2 text-2xl font-bold text-emerald-400">
                {monthlyReport.totalActualIncome.toLocaleString()} {currency}
              </div>
              <span className="text-xs text-slate-400 mt-1 block">
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
                className={`mt-2 text-2xl font-bold ${
                  monthlyReport.netSavings >= 0 ? 'text-teal-400' : 'text-rose-400'
                }`}
              >
                {monthlyReport.netSavings >= 0 ? '+' : ''}
                {monthlyReport.netSavings.toLocaleString()} {currency}
              </div>
              <span className="text-xs text-slate-400 mt-1 block">
                {isFr ? 'Écart budget :' : 'Budget diff:'}{' '}
                {monthlyReport.netBudgetDifference.toLocaleString()} {currency}
              </span>
            </div>

            {/* Savings Rate */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                {isFr ? 'Taux d’Épargne' : 'Savings Rate'}
              </span>
              <div className="mt-2 text-2xl font-bold text-indigo-400">
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
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-sm">
                  {isFr
                    ? 'Courbe d’Épuisement Budgétaire (Burn-Down)'
                    : 'Budget Burn-Down Curve'}
                </h3>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-3 h-0.5 bg-slate-600 border-dashed" />
                  {isFr ? 'Idéal (Linéaire)' : 'Ideal'}
                </span>
                <span className="flex items-center gap-1.5 text-teal-400">
                  <span className="w-3 h-0.5 bg-teal-400" />
                  {isFr ? 'Dépenses réelles' : 'Actual Spent'}
                </span>
              </div>
            </div>

            {/* SVG Burn Down Chart */}
            <div className="h-44 w-full pt-2">
              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 300 100">
                <defs>
                  <linearGradient id="actualBurnGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid horizontal lines */}
                <line x1="0" y1="20" x2="300" y2="20" stroke="#1e293b" strokeDasharray="3 3" />
                <line x1="0" y1="50" x2="300" y2="50" stroke="#1e293b" strokeDasharray="3 3" />
                <line x1="0" y1="80" x2="300" y2="80" stroke="#1e293b" strokeDasharray="3 3" />

                {(() => {
                  const pts = monthlyReport.burnDownPoints;
                  if (pts.length < 2) return null;
                  const maxBudget = Math.max(
                    monthlyReport.totalExpenseBudget,
                    monthlyReport.totalActualExpenses,
                    100
                  );

                  // Ideal linear line from (0, 100) to (300, 0)
                  const idealPath = `M 0,100 L 300,${100 - (monthlyReport.totalExpenseBudget / maxBudget) * 90}`;

                  // Actual curve up to current day
                  const activePts = pts.filter(p => p.actual > 0);
                  if (activePts.length < 1) return null;

                  const actualCoords = activePts.map(p => {
                    const x = ((p.day - 1) / (pts.length - 1)) * 300;
                    const y = 100 - (p.actual / maxBudget) * 90;
                    return `${x},${y}`;
                  });

                  const actualPath = `M 0,100 L ` + actualCoords.join(' L ');
                  const lastCoord = actualCoords[actualCoords.length - 1].split(',');
                  const lastX = lastCoord[0];
                  const actualArea = `${actualPath} L ${lastX},100 Z`;

                  return (
                    <>
                      {/* Ideal line */}
                      <path d={idealPath} stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 4" fill="none" />
                      {/* Actual area */}
                      <path d={actualArea} fill="url(#actualBurnGrad)" />
                      {/* Actual line */}
                      <path d={actualPath} stroke="#2dd4bf" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                      {/* Point node on current day */}
                      <circle cx={lastCoord[0]} cy={lastCoord[1]} r="4" fill="#2dd4bf" />
                    </>
                  );
                })()}
              </svg>
            </div>
          </div>

          {/* Category Breakdown & Member Share Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Category Spend Distribution (2 cols) */}
            <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <h3 className="font-bold text-white text-sm">
                {isFr ? 'Répartition par Catégorie' : 'Category Spend Breakdown'}
              </h3>

              <div className="space-y-3">
                {monthlyReport.categories.map(cat => (
                  <div key={cat.categoryId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <CategoryIcon name={cat.categoryIcon} className="w-4 h-4 text-slate-300" />
                        <span className="font-semibold text-slate-200">{cat.categoryName}</span>
                      </div>
                      <div className="flex items-center gap-2">
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

                    <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          cat.isOverBudget ? 'bg-rose-500' : 'bg-teal-500'
                        }`}
                        style={{ width: `${Math.min(100, cat.percentageUsed)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
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
              <div className="mt-1 text-2xl font-bold text-white">
                {yearlyReport.totalAnnualBudget.toLocaleString()} {currency}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 block">
                {isFr ? 'Dépensé sur l’Année (YTD)' : 'Year-to-Date Spent'}
              </span>
              <div className="mt-1 text-2xl font-bold text-slate-100">
                {yearlyReport.totalAnnualSpent.toLocaleString()} {currency}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 block">
                {isFr ? 'Revenus Annuels Réalisés' : 'Annual Income Received'}
              </span>
              <div className="mt-1 text-2xl font-bold text-emerald-400">
                {yearlyReport.totalAnnualIncome.toLocaleString()} {currency}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400 block">
                {isFr ? 'Solde Budgétaire Annuel' : 'Remaining Annual Allowance'}
              </span>
              <div className="mt-1 text-2xl font-bold text-teal-400">
                {yearlyReport.remainingAnnualBudget.toLocaleString()} {currency}
              </div>
            </div>
          </div>

          {/* 12 Months Matrix Table */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 font-bold text-sm text-white">
              {isFr ? 'Historique Mois par Mois' : 'Month-by-Month Trend Matrix'}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">{isFr ? 'Mois' : 'Month'}</th>
                    <th className="py-3 px-4">{isFr ? 'Revenus' : 'Income'}</th>
                    <th className="py-3 px-4">{isFr ? 'Dépenses' : 'Expenses'}</th>
                    <th className="py-3 px-4">{isFr ? 'Solde / Épargne' : 'Net Savings'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {yearlyReport.monthlyBreakdown.map(m => (
                    <tr key={m.monthIndex} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 text-slate-200 capitalize">{m.monthName}</td>
                      <td className="py-3 px-4 text-emerald-400">
                        {m.income > 0 ? `+${m.income.toLocaleString()}` : '0'} {currency}
                      </td>
                      <td className="py-3 px-4 text-slate-100">
                        {m.expenses.toLocaleString()} {currency}
                      </td>
                      <td
                        className={`py-3 px-4 font-bold ${
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
        </div>
      )}
    </div>
  );
};
