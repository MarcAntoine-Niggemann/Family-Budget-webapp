import React, { useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  GitCompare,
  Info,
  RotateCcw
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { computeCashFlowForecast, CashFlowPoint } from '../utils/forecastEngine';

type HorizonMode = '30' | '60' | '90' | 'CUSTOM';

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateInputValue(value: string): Date | null {
  const parts = value.split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function addDaysToDateInput(value: string, days: number): string {
  const parsed = parseDateInputValue(value);
  if (!parsed) return value;
  return toDateInputValue(new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() + days));
}

export const CustomForecastScreen: React.FC = () => {
  const {
    accounts,
    transactions,
    budgets,
    effectiveBudgets,
    activeSimulation,
    currency,
    language,
    resolvedTheme
  } = useBudget();
  const isFr = language === 'fr';
  const isDark = resolvedTheme === 'dark';

  const todayStr = toDateInputValue(new Date());
  const includedAccounts = accounts.filter(a => !a.isDeleted && a.includeInLiquidForecast);
  const includedAccountsBalance =
    Math.round(includedAccounts.reduce((acc, a) => acc + (a.currentBalance || 0), 0) * 100) / 100;

  const [horizonMode, setHorizonMode] = useState<HorizonMode>('30');
  const [customStartDate, setCustomStartDate] = useState<string>(todayStr);
  const [customEndDate, setCustomEndDate] = useState<string>(() => addDaysToDateInput(todayStr, 30));
  const [customStartingBalanceStr, setCustomStartingBalanceStr] = useState<string>(() =>
    String(includedAccountsBalance)
  );
  const [hasCustomBalanceEdit, setHasCustomBalanceEdit] = useState<boolean>(false);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [compareWithLive, setCompareWithLive] = useState<boolean>(true);

  const isCustomMode = horizonMode === 'CUSTOM';
  const isCustomStart = isCustomMode && customStartDate !== todayStr;

  const startDateObj = parseDateInputValue(customStartDate);
  const endDateObj = parseDateInputValue(customEndDate);

  const parsedBalanceRaw =
    customStartingBalanceStr.trim() === '' ? Number.NaN : Number(customStartingBalanceStr);
  const hasValidStartingBalance = Number.isFinite(parsedBalanceRaw);
  const needsStartingBalance = isCustomStart && !hasValidStartingBalance;

  const isEndBeforeStart = Boolean(
    isCustomMode && startDateObj && endDateObj && endDateObj.getTime() < startDateObj.getTime()
  );
  const requestedDaySpan =
    isCustomMode && startDateObj && endDateObj
      ? Math.round((endDateObj.getTime() - startDateObj.getTime()) / 86_400_000) + 1
      : 0;
  const isRangeCapped = isCustomMode && requestedDaySpan > 1826;

  const handleSelectHorizon = (mode: HorizonMode) => {
    setHorizonMode(mode);
    setSelectedPointIndex(null);
    if (mode === 'CUSTOM' && customStartDate === todayStr && !hasCustomBalanceEdit) {
      setCustomStartingBalanceStr(String(includedAccountsBalance));
    }
  };

  const handleStartDateChange = (nextStart: string) => {
    setCustomStartDate(nextStart);
    setSelectedPointIndex(null);

    const nextStartParsed = parseDateInputValue(nextStart);
    const curEndParsed = parseDateInputValue(customEndDate);
    if (nextStartParsed && (!curEndParsed || curEndParsed.getTime() < nextStartParsed.getTime())) {
      setCustomEndDate(addDaysToDateInput(nextStart, 30));
    }

    if (nextStart !== todayStr) {
      if (!hasCustomBalanceEdit) {
        setCustomStartingBalanceStr('');
      }
    } else if (!hasCustomBalanceEdit) {
      setCustomStartingBalanceStr(String(includedAccountsBalance));
    }
  };

  const handleEndDateChange = (nextEnd: string) => {
    setCustomEndDate(nextEnd);
    setSelectedPointIndex(null);
  };

  const handleStartingBalanceChange = (value: string) => {
    setCustomStartingBalanceStr(value);
    setHasCustomBalanceEdit(true);
    setSelectedPointIndex(null);
  };

  const handleUseLiveBalance = () => {
    setCustomStartingBalanceStr(String(includedAccountsBalance));
    setHasCustomBalanceEdit(isCustomStart);
    setSelectedPointIndex(null);
  };

  const forecastOptions = isCustomMode
    ? {
        startDate: startDateObj ?? undefined,
        endDate:
          startDateObj && endDateObj && endDateObj.getTime() >= startDateObj.getTime()
            ? endDateObj
            : startDateObj ?? undefined,
        startingBalanceOverride:
          hasValidStartingBalance && (isCustomStart || hasCustomBalanceEdit)
            ? parsedBalanceRaw
            : null,
        locale: language
      }
    : {
        horizonDays: Number(horizonMode),
        locale: language
      };

  const forecast = computeCashFlowForecast(
    accounts,
    transactions,
    effectiveBudgets,
    forecastOptions
  );

  const showLiveComparison = Boolean(activeSimulation && compareWithLive);
  const liveForecast = showLiveComparison
    ? computeCashFlowForecast(accounts, transactions, budgets, forecastOptions)
    : null;

  const timeline = forecast.timeline;
  const activeIdx =
    selectedPointIndex !== null && timeline[selectedPointIndex] ? selectedPointIndex : 0;
  const activePoint: CashFlowPoint | null = timeline[activeIdx] || null;
  const activeLivePoint: CashFlowPoint | null =
    liveForecast && liveForecast.timeline[activeIdx] ? liveForecast.timeline[activeIdx] : null;

  const formatSignedDelta = (delta: number) => {
    const rounded = Math.round(delta * 100) / 100;
    return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
  };

  const dateLocale = isFr ? 'fr-FR' : 'en-US';
  const spanLabel = `${new Date(forecast.startDateMillis).toLocaleDateString(dateLocale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })} → ${new Date(forecast.endDateMillis).toLocaleDateString(dateLocale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })}`;

  const usingCustomStartPoint =
    forecast.isCustomStartDate || (isCustomMode && hasCustomBalanceEdit && hasValidStartingBalance);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {isFr ? 'Trésorerie Prévisionnelle Interactive' : 'Interactive Cash Flow Forecast'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isFr
              ? 'Simulation jour par jour sur les comptes inclus dans la prévision selon vos budgets planifiés et répartis'
              : 'Day-by-day simulation across forecast-included accounts based on your scheduled and spread budgets'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {activeSimulation && (
            <button
              type="button"
              onClick={() => setCompareWithLive(prev => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer ${
                compareWithLive
                  ? 'bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500 shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>{isFr ? 'Comparer au Live' : 'Compare vs. Live'}</span>
            </button>
          )}

          {/* Horizon Picker */}
          <div className="grid grid-cols-4 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold shrink-0">
            {(['30', '60', '90'] as const).map(days => (
              <button
                key={days}
                onClick={() => handleSelectHorizon(days)}
                className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap shrink-0 cursor-pointer ${
                  horizonMode === days
                    ? 'bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 font-bold shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {isFr ? `${days} Jours` : `${days} Days`}
              </button>
            ))}
            <button
              onClick={() => handleSelectHorizon('CUSTOM')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 cursor-pointer ${
                horizonMode === 'CUSTOM'
                  ? 'bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 font-bold shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{isFr ? 'Perso' : 'Custom'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Custom Date Range & Starting Point Controls */}
      {isCustomMode && (
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-lg space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
            {/* Start Date */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                {isFr ? 'Date de début' : 'Start Date'}
              </label>
              <input
                type="date"
                value={customStartDate}
                onChange={e => handleStartDateChange(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:border-teal-500"
              />
              {isCustomStart ? (
                <button
                  type="button"
                  onClick={() => {
                    setHasCustomBalanceEdit(false);
                    handleStartDateChange(todayStr);
                  }}
                  className="mt-1.5 text-[11px] text-teal-700 hover:text-teal-600 dark:text-teal-400 dark:hover:text-teal-300 transition font-medium"
                >
                  {isFr ? 'Revenir à aujourd’hui' : 'Reset to today'}
                </button>
              ) : (
                <span className="mt-1.5 block text-[11px] text-slate-500">
                  {isFr ? 'Commence aujourd’hui (avec transactions du mois)' : 'Starts today (includes booked month items)'}
                </span>
              )}
            </div>

            {/* End Date */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                {isFr ? 'Date de fin' : 'End Date'}
              </label>
              <input
                type="date"
                value={customEndDate}
                min={customStartDate}
                max={addDaysToDateInput(customStartDate, 1825)}
                onChange={e => handleEndDateChange(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border text-sm text-slate-900 dark:text-white font-mono focus:outline-none ${
                  isEndBeforeStart
                    ? 'border-rose-500 focus:border-rose-400'
                    : 'border-slate-300 dark:border-slate-700 focus:border-teal-500'
                }`}
              />
              {isEndBeforeStart ? (
                <span className="mt-1.5 block text-[11px] text-rose-600 dark:text-rose-400">
                  {isFr ? 'La date de fin doit être ≥ au début' : 'End date must be on or after start date'}
                </span>
              ) : isRangeCapped ? (
                <span className="mt-1.5 block text-[11px] text-amber-600 dark:text-amber-400">
                  {isFr ? 'Horizon plafonné à 5 ans (1826 jours)' : 'Range capped at 5 years (1,826 days)'}
                </span>
              ) : (
                <span className="mt-1.5 block text-[11px] text-slate-500 font-mono tabular-nums">
                  {isFr ? `Durée : ${forecast.totalDays} jour(s)` : `Span: ${forecast.totalDays} day(s)`}
                </span>
              )}
            </div>

            {/* Starting Balance */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {isCustomStart
                    ? isFr
                      ? 'Solde initial requis'
                      : 'Starting Balance (Required)'
                    : isFr
                    ? 'Solde initial (optionnel)'
                    : 'Starting Balance (Optional)'}
                </label>
                <span className="text-[11px] font-mono text-slate-500">{currency}</span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={customStartingBalanceStr}
                  placeholder={isFr ? 'Ex : 2500' : 'e.g. 2500'}
                  onChange={e => handleStartingBalanceChange(e.target.value)}
                  className={`w-full px-3 py-2 pr-12 rounded-xl bg-slate-50 dark:bg-slate-950 border text-sm text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none ${
                    needsStartingBalance
                      ? 'border-amber-500 ring-1 ring-amber-500/40 focus:border-amber-400'
                      : 'border-slate-300 dark:border-slate-700 focus:border-teal-500'
                  }`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 pointer-events-none">
                  {currency}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
                {needsStartingBalance ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    {isFr ? 'Indiquez le solde à cette date' : 'Specify balance on start date'}
                  </span>
                ) : isCustomStart ? (
                  <span className="text-slate-500">
                    {isFr ? 'Simulation pure sur budgets' : 'Pure budget simulation'}
                  </span>
                ) : (
                  <span className="text-slate-500 font-mono tabular-nums">
                    {isFr
                      ? `Actuel : ${includedAccountsBalance.toLocaleString()} ${currency}`
                      : `Live: ${includedAccountsBalance.toLocaleString()} ${currency}`}
                  </span>
                )}
                {(isCustomStart || hasCustomBalanceEdit) && (
                  <button
                    type="button"
                    onClick={handleUseLiveBalance}
                    className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-600 dark:text-teal-400 dark:hover:text-teal-300 transition font-medium shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>
                      {isCustomStart
                        ? isFr
                          ? 'Solde actuel'
                          : 'Use current'
                        : isFr
                        ? 'Réinitialiser'
                        : 'Reset'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prompt when custom start date lacks a starting balance */}
      {needsStartingBalance ? (
        <div className="p-6 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 flex items-start gap-3 text-amber-900 dark:text-amber-200">
          <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-sm">
              {isFr
                ? 'Solde de départ requis pour une date personnalisée'
                : 'Starting Balance Required for Custom Start Date'}
            </h2>
            <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-1">
              {isFr
                ? `Comme la simulation démarre le ${customStartDate} au lieu d'aujourd'hui, saisissez le solde initial ci-dessus (ou cliquez sur « Solde actuel ») pour calculer la courbe.`
                : `Because this forecast starts on ${customStartDate} instead of today, enter the starting balance above (or click "Use current") to compute the trajectory.`}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Overdraft Warning Banner if lowest dip < 0 or buffer alert if < 500 */}
          {forecast.hasOverdraftRisk ? (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/40 text-rose-900 dark:text-rose-300 flex items-start gap-3 shadow-sm dark:shadow-lg">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-sm text-rose-900 dark:text-rose-200">
                  {isFr ? 'Risque de Solde Négatif Détecté !' : 'Projected Negative Balance Warning!'}
                </h2>
                <p className="text-xs text-rose-800 dark:text-rose-300/90 mt-0.5 font-mono tabular-nums">
                  {isFr
                    ? `Votre disponible prévisionnel plonge à ${forecast.lowestBalance.toLocaleString()} ${currency} autour du ${forecast.lowestBalanceDate}. Ajustez vos dépenses prévues.`
                    : `Your projected balance drops to ${forecast.lowestBalance.toLocaleString()} ${currency} around ${forecast.lowestBalanceDate}. Adjust planned spending.`}
                </p>
              </div>
            </div>
          ) : forecast.hasBufferWarning ? (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/40 text-amber-900 dark:text-amber-300 flex items-start gap-3 shadow-sm dark:shadow-lg">
              <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-sm text-amber-900 dark:text-amber-200">
                  {isFr ? 'Zone de Trésorerie Basse (< 500)' : 'Low Cash Buffer Warning (< 500)'}
                </h2>
                <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-0.5 font-mono tabular-nums">
                  {isFr
                    ? `Minimum prévu à ${forecast.lowestBalance.toLocaleString()} ${currency} le ${forecast.lowestBalanceDate}.`
                    : `Minimum projected at ${forecast.lowestBalance.toLocaleString()} ${currency} on ${forecast.lowestBalanceDate}.`}
                </p>
              </div>
            </div>
          ) : null}

          {/* Forecast Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Minimum Projected Balance (primary liquidity floor) */}
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-md">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tracking-wide block">
                {isFr ? 'Minimum Prévu sur la Période' : 'Minimum Projected Balance'}
              </span>
              <div
                className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
                  forecast.lowestBalance >= 500
                    ? 'text-teal-700 dark:text-teal-400'
                    : forecast.lowestBalance >= 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {forecast.lowestBalance.toLocaleString()} {currency}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                {isFr ? `Point bas atteint le ${forecast.lowestBalanceDate}` : `Lowest point on ${forecast.lowestBalanceDate}`}
              </span>
              {liveForecast && (
                <div className="mt-1.5 text-[11px] font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                  vs Live: {formatSignedDelta(forecast.lowestBalance - liveForecast.lowestBalance)}
                </div>
              )}
            </div>

            {/* Current Forecast Balance across included accounts or custom override */}
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-md">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tracking-wide block">
                {isFr ? 'Solde Initial Prévisionnel' : 'Forecast Starting Balance'}
              </span>
              <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                {forecast.currentTotalBalance.toLocaleString()} {currency}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                {usingCustomStartPoint
                  ? isFr
                    ? 'Point de départ personnalisé'
                    : 'Custom starting point'
                  : isFr
                  ? `Comptes inclus (${forecast.accountCount})`
                  : `Included accounts (${forecast.accountCount})`}
              </span>
              {liveForecast && timeline.length > 0 && liveForecast.timeline.length > 0 && (
                <div className="mt-1.5 text-[11px] font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                  {isFr ? 'Fin :' : 'End:'}{' '}
                  {timeline[timeline.length - 1].balance.toLocaleString()} {currency} (
                  {formatSignedDelta(
                    timeline[timeline.length - 1].balance -
                      liveForecast.timeline[liveForecast.timeline.length - 1].balance
                  )}
                  )
                </div>
              )}
            </div>

            {/* Upcoming Scheduled Bills */}
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-md">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tracking-wide block">
                {isFr ? 'Échéances Dépenses Prévues' : 'Upcoming Scheduled Bills'}
              </span>
              <div className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400 font-mono tabular-nums">
                -{forecast.upcomingBillsTotal.toLocaleString()} {currency}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                {isFr ? 'Prélèvements datés sur la période' : 'Dated debits in range'}
              </span>
              {liveForecast && (
                <div className="mt-1.5 text-[11px] font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                  vs Live: {formatSignedDelta(forecast.upcomingBillsTotal - liveForecast.upcomingBillsTotal)}
                </div>
              )}
            </div>

            {/* Upcoming Scheduled Income */}
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-md">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tracking-wide block">
                {isFr ? 'Revenus Datés Attendus' : 'Upcoming Scheduled Income'}
              </span>
              <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                +{forecast.upcomingIncomeTotal.toLocaleString()} {currency}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                {isFr ? 'Crédits datés sur la période' : 'Dated credits in range'}
              </span>
              {liveForecast && (
                <div className="mt-1.5 text-[11px] font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                  vs Live: {formatSignedDelta(forecast.upcomingIncomeTotal - liveForecast.upcomingIncomeTotal)}
                </div>
              )}
            </div>
          </div>

          {/* Interactive Chart Container */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white text-sm">
                  {isFr ? 'Courbe d’Évolution de Trésorerie' : 'Cash Flow Trajectory'}
                  {activeSimulation && (
                    <span className="ml-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                      · {activeSimulation.name}
                    </span>
                  )}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                  {spanLabel} · {forecast.totalDays} {isFr ? 'jours' : 'days'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {liveForecast && (
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-teal-700 dark:text-teal-400 font-medium">
                      <span className="w-4 h-0.5 bg-teal-600 dark:bg-teal-400" />
                      {activeSimulation?.name}
                    </span>
                    <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-medium">
                      <span className="w-4 border-t-2 border-dashed border-indigo-500 dark:border-indigo-400" />
                      {isFr ? 'Base Live' : 'Live Baseline'}
                    </span>
                  </div>
                )}
                <span className="text-slate-500 dark:text-slate-400">
                  {isFr
                    ? 'Survolez ou cliquez sur la courbe pour examiner chaque date'
                    : 'Hover or tap to inspect daily balance & scheduled events'}
                </span>
              </div>
            </div>

            {/* Single-day view vs SVG Interactive Graph */}
            {timeline.length === 1 ? (
              <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">{timeline[0].dateStr}</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5 block">
                    {isFr ? 'Prévision sur une seule journée' : 'Single-day forecast snapshot'}
                  </span>
                </div>
                <span
                  className={`text-xl font-bold font-mono tabular-nums ${
                    timeline[0].balance >= 0
                      ? 'text-teal-700 dark:text-teal-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {timeline[0].balance.toLocaleString()} {currency}
                </span>
              </div>
            ) : timeline.length >= 2 ? (
              (() => {
                const balances = timeline.map(t => t.balance);
                const liveBalances = liveForecast ? liveForecast.timeline.map(t => t.balance) : [];
                const allScaleBalances = liveBalances.length > 0 ? [...balances, ...liveBalances] : balances;
                const rawMin = Math.min(...allScaleBalances);
                const rawMax = Math.max(...allScaleBalances);
                const span = rawMax - rawMin || 500;
                const minBal = rawMin < 0 ? rawMin - span * 0.08 : Math.max(0, rawMin - span * 0.15);
                const maxBal = rawMax + span * 0.08;
                const range = maxBal - minBal || 1;

                const width = 800;
                const height = 240;
                const padding = 20;

                const points = timeline.map((pt, idx) => {
                  const x = padding + (idx / (timeline.length - 1)) * (width - 2 * padding);
                  const y = height - padding - ((pt.balance - minBal) / range) * (height - 2 * padding);
                  return { x, y, pt, idx };
                });

                const pathD =
                  `M ${points[0].x},${points[0].y} ` +
                  points
                    .slice(1)
                    .map(p => `L ${p.x},${p.y}`)
                    .join(' ');

                const areaD = `${pathD} L ${points[points.length - 1].x},${height - padding} L ${points[0].x},${height - padding} Z`;

                const livePathD =
                  liveForecast && liveForecast.timeline.length >= 2
                    ? (() => {
                        const lPts = liveForecast.timeline.map((pt, idx) => {
                          const x =
                            padding +
                            (idx / (liveForecast.timeline.length - 1)) * (width - 2 * padding);
                          const y =
                            height -
                            padding -
                            ((pt.balance - minBal) / range) * (height - 2 * padding);
                          return { x, y };
                        });
                        return (
                          `M ${lPts[0].x},${lPts[0].y} ` +
                          lPts
                            .slice(1)
                            .map(p => `L ${p.x},${p.y}`)
                            .join(' ')
                        );
                      })()
                    : null;

                const zeroY = height - padding - ((0 - minBal) / range) * (height - 2 * padding);

                const tickIndices =
                  timeline.length <= 5
                    ? timeline.map((_, i) => i)
                    : [
                        0,
                        Math.floor((timeline.length - 1) * 0.25),
                        Math.floor((timeline.length - 1) * 0.5),
                        Math.floor((timeline.length - 1) * 0.75),
                        timeline.length - 1
                      ];

                return (
                  <div className="space-y-1.5 select-none">
                    <div className="flex gap-2 items-stretch">
                      <div className="flex flex-col justify-between text-[10px] font-mono tabular-nums text-slate-500 py-3 text-right min-w-[60px] shrink-0">
                        <span>
                          {Math.round(maxBal).toLocaleString()} {currency}
                        </span>
                        {minBal < 0 && maxBal > 0 && <span>0 {currency}</span>}
                        <span>
                          {Math.round(minBal).toLocaleString()} {currency}
                        </span>
                      </div>
                      <div className="relative h-64 flex-1">
                        <svg
                          className="w-full h-full overflow-visible"
                          viewBox={`0 0 ${width} ${height}`}
                          preserveAspectRatio="none"
                        >
                          <defs>
                            <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop
                                offset="0%"
                                stopColor={isDark ? '#14b8a6' : '#0d9488'}
                                stopOpacity={isDark ? '0.35' : '0.24'}
                              />
                              <stop
                                offset="100%"
                                stopColor={isDark ? '#14b8a6' : '#0d9488'}
                                stopOpacity="0.02"
                              />
                            </linearGradient>
                          </defs>

                          {/* Horizontal reference gridlines */}
                          <line x1={padding} y1={height * 0.25} x2={width - padding} y2={height * 0.25} stroke={isDark ? '#1e293b' : '#e2e8f0'} strokeDasharray="3 3" />
                          <line x1={padding} y1={height * 0.5} x2={width - padding} y2={height * 0.5} stroke={isDark ? '#1e293b' : '#e2e8f0'} strokeDasharray="3 3" />
                          <line x1={padding} y1={height * 0.75} x2={width - padding} y2={height * 0.75} stroke={isDark ? '#1e293b' : '#e2e8f0'} strokeDasharray="3 3" />

                          {/* Zero line if applicable */}
                          {minBal < 0 && zeroY >= padding && zeroY <= height - padding && (
                            <line
                              x1={padding}
                              y1={zeroY}
                              x2={width - padding}
                              y2={zeroY}
                              stroke={isDark ? '#f43f5e' : '#e11d48'}
                              strokeWidth="1.5"
                              strokeDasharray="4 4"
                            />
                          )}

                          {/* Live Baseline overlay line when comparing */}
                          {livePathD && (
                            <path
                              d={livePathD}
                              fill="none"
                              stroke={isDark ? '#818cf8' : '#6366f1'}
                              strokeWidth="1.75"
                              strokeDasharray="5 4"
                              strokeOpacity="0.85"
                            />
                          )}

                          {/* Area and Line */}
                          <path d={areaD} fill="url(#cfGrad)" />
                          <path
                            d={pathD}
                            fill="none"
                            stroke={isDark ? '#2dd4bf' : '#0d9488'}
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />

                          {/* Milestone Marker Nodes */}
                          {points.map((p, idx) => {
                            const hasPayday = p.pt.isPayday;
                            const hasBill = p.pt.isBillDay;
                            const isLowest = p.pt.isLowestPoint;

                            if (!hasPayday && !hasBill && !isLowest) return null;

                            const radius = timeline.length > 180 ? (isLowest ? 4 : 2.5) : isLowest ? 5 : 4;

                            return (
                              <circle
                                key={idx}
                                cx={p.x}
                                cy={p.y}
                                r={radius}
                                fill={hasPayday ? '#10b981' : isLowest ? '#f43f5e' : '#f59e0b'}
                                stroke={isDark ? '#0f172a' : '#ffffff'}
                                strokeWidth={timeline.length > 180 ? 1 : 2}
                                className="cursor-pointer transition hover:scale-125"
                                onClick={() => setSelectedPointIndex(idx)}
                              />
                            );
                          })}

                          {/* Scrubber vertical line if selected */}
                          {selectedPointIndex !== null && points[selectedPointIndex] && (
                            <>
                              <line
                                x1={points[selectedPointIndex].x}
                                y1={padding}
                                x2={points[selectedPointIndex].x}
                                y2={height - padding}
                                stroke={isDark ? '#38bdf8' : '#0284c7'}
                                strokeWidth="1.5"
                                strokeDasharray="2 2"
                              />
                              <circle
                                cx={points[selectedPointIndex].x}
                                cy={points[selectedPointIndex].y}
                                r="6"
                                fill={isDark ? '#38bdf8' : '#0284c7'}
                                stroke={isDark ? '#0f172a' : '#ffffff'}
                                strokeWidth="2"
                              />
                            </>
                          )}

                          {/* Invisible hover overlay rectangles for scrubber interaction */}
                          {points.map((p, idx) => {
                            const stepW = (width - 2 * padding) / points.length;
                            return (
                              <rect
                                key={`hit_${idx}`}
                                x={p.x - stepW / 2}
                                y={0}
                                width={Math.max(stepW, 1)}
                                height={height}
                                fill="transparent"
                                className="cursor-pointer"
                                onMouseEnter={() => setSelectedPointIndex(idx)}
                                onClick={() => setSelectedPointIndex(idx)}
                              />
                            );
                          })}
                        </svg>
                      </div>
                    </div>

                    {/* X-axis date ticks */}
                    <div className="flex justify-between pl-[68px] pr-2 text-[10px] font-mono tabular-nums text-slate-500">
                      {tickIndices.map((tIdx, i) => (
                        <span key={`${tIdx}_${i}`}>{timeline[tIdx]?.dateStr}</span>
                      ))}
                    </div>
                  </div>
                );
              })()
            ) : null}

            {/* Selected Scrubber Details Card */}
            {activePoint && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-teal-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 font-medium block">
                    {isFr ? 'Date sélectionnée :' : 'Inspected date:'}{' '}
                    <strong className="text-slate-900 dark:text-white text-sm">{activePoint.dateStr}</strong>
                  </span>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-slate-500 dark:text-slate-400">
                      {isFr ? 'Solde prévisionnel :' : 'Projected balance:'}
                    </span>
                    <span
                      className={`text-sm font-bold font-mono tabular-nums ${
                        activePoint.balance >= 0
                          ? 'text-teal-700 dark:text-teal-300'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {activePoint.balance.toLocaleString()} {currency}
                    </span>
                    {activeLivePoint && (
                      <span className="text-xs font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                        · Live: {activeLivePoint.balance.toLocaleString()} {currency} (
                        {formatSignedDelta(activePoint.balance - activeLivePoint.balance)})
                      </span>
                    )}
                  </div>
                </div>

                {/* Events for this day */}
                <div className="flex-1 sm:max-w-md">
                  {activePoint.events.length === 0 ? (
                    <span className="text-slate-500 italic">
                      {isFr
                        ? 'Aucune échéance fixe ce jour (dépenses discrétionnaires courantes au fil de l’eau).'
                        : 'No fixed recurring debits on this date (regular daily burn rate).'}
                    </span>
                  ) : (
                    <div className="space-y-1">
                      {activePoint.events.map((ev, evIdx) => (
                        <div
                          key={evIdx}
                          className="flex items-center justify-between py-1 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px]"
                        >
                          <span className="text-slate-800 dark:text-slate-200 font-semibold">{ev.title}</span>
                          <span
                            className={`font-bold font-mono tabular-nums ${
                              ev.isExpense
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {ev.isExpense ? '' : '+'}
                            {ev.amount.toLocaleString()} {currency}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Day by Day Event Agenda Table */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm dark:shadow-xl">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 font-bold text-sm text-slate-900 dark:text-white">
              {isFr ? 'Calendrier des Échéances Futures' : 'Scheduled Movement Calendar'}
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-800/60 max-h-96 overflow-y-auto">
              {timeline
                .filter(pt => pt.events.length > 0 || pt.isLowestPoint)
                .map((pt, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-slate-700 dark:text-slate-200 w-24 shrink-0">{pt.dateStr}</span>
                      <div className="space-y-0.5">
                        {pt.events.map((e, eIdx) => (
                          <div key={eIdx} className="flex items-center gap-2">
                            <span className="text-slate-900 dark:text-white font-medium">{e.title}</span>
                            {e.categoryName && (
                              <span className="text-slate-500 dark:text-slate-400 text-[11px]">({e.categoryName})</span>
                            )}
                          </div>
                        ))}
                        {pt.isLowestPoint && (
                          <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                            ★ {isFr ? 'Point le plus bas estimé sur la période' : 'Lowest projected point in range'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className={`font-bold font-mono tabular-nums ${
                          pt.balance >= 0
                            ? 'text-teal-700 dark:text-teal-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {pt.balance.toLocaleString()} {currency}
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {isFr ? 'Solde fin de journée' : 'End of day balance'}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
