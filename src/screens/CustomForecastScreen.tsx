import React, { useState } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  Calendar,
  DollarSign,
  ArrowDownRight,
  ArrowUpRight,
  Info,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { computeCashFlowForecast, CashFlowPoint } from '../utils/forecastEngine';

export const CustomForecastScreen: React.FC = () => {
  const { accounts, transactions, budgets, currency, language } = useBudget();
  const isFr = language === 'fr';

  const [horizonDays, setHorizonDays] = useState<number>(30);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);

  const forecast = computeCashFlowForecast(accounts, transactions, budgets, horizonDays);
  const timeline = forecast.timeline;

  const activePoint: CashFlowPoint | null =
    selectedPointIndex !== null && timeline[selectedPointIndex]
      ? timeline[selectedPointIndex]
      : timeline[0] || null;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {isFr ? 'Trésorerie Prévisionnelle Interactive' : 'Interactive Cash Flow Forecast'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {isFr
              ? 'Simulation jour par jour intégrant salaires, loyers, prélèvements et cartes à débit différé'
              : 'Day-by-day cash flow simulation factoring recurring salaries, bills, and card settlements'}
          </p>
        </div>

        {/* Horizon Picker */}
        <div className="grid grid-cols-3 p-1 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold">
          <button
            onClick={() => {
              setHorizonDays(30);
              setSelectedPointIndex(null);
            }}
            className={`px-3 py-1.5 rounded-lg transition ${
              horizonDays === 30
                ? 'bg-teal-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {isFr ? '30 Jours' : '30 Days'}
          </button>
          <button
            onClick={() => {
              setHorizonDays(60);
              setSelectedPointIndex(null);
            }}
            className={`px-3 py-1.5 rounded-lg transition ${
              horizonDays === 60
                ? 'bg-teal-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {isFr ? '60 Jours' : '60 Days'}
          </button>
          <button
            onClick={() => {
              setHorizonDays(90);
              setSelectedPointIndex(null);
            }}
            className={`px-3 py-1.5 rounded-lg transition ${
              horizonDays === 90
                ? 'bg-teal-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {isFr ? '90 Jours' : '90 Days'}
          </button>
        </div>
      </div>

      {/* Overdraft Warning Banner if lowest dip < 0 or buffer alert if < 500 */}
      {forecast.hasOverdraftRisk ? (
        <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 flex items-start gap-3 shadow-lg">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-sm text-rose-200">
              {isFr ? 'Risque de Découvert Bancaire Détecté !' : 'Overdraft Warning Detected!'}
            </h2>
            <p className="text-xs text-rose-300/90 mt-0.5">
              {isFr
                ? `Votre solde prévisionnel plonge à ${forecast.lowestBalance} ${currency} autour du ${forecast.lowestBalanceDate}. Ajustez vos dépenses ou effectuez un virement depuis votre épargne.`
                : `Your projected balance drops to ${forecast.lowestBalance} ${currency} around ${forecast.lowestBalanceDate}. Reduce discretionary spending or transfer funds from savings.`}
            </p>
          </div>
        </div>
      ) : forecast.hasBufferWarning ? (
        <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-300 flex items-start gap-3 shadow-lg">
          <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-sm text-amber-200">
              {isFr ? 'Zone de Trésorerie Basse (< 500 €)' : 'Low Cash Buffer Warning (< 500 €)'}
            </h2>
            <p className="text-xs text-amber-300/90 mt-0.5">
              {isFr
                ? `Point bas estimé à ${forecast.lowestBalance} ${currency} le ${forecast.lowestBalanceDate}. Restez vigilant sur les dépenses non planifiées.`
                : `Lowest point estimated at ${forecast.lowestBalance} ${currency} on ${forecast.lowestBalanceDate}. Stay cautious on unbudgeted expenses.`}
            </p>
          </div>
        </div>
      ) : null}

      {/* Safe to Spend Now & Simulation Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Safe to Spend Now */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            {isFr ? 'Dépensable Sans Risque' : 'Safe to Spend Now'}
          </span>
          <div className="mt-2 text-2xl font-bold text-emerald-400">
            {forecast.safeToSpendNow.toLocaleString()} {currency}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {isFr ? 'Après déduction des factures à venir' : 'After reserving for upcoming bills'}
          </span>
        </div>

        {/* Current Liquid Balance */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            {isFr ? 'Solde Liquide Actuel' : 'Current Liquid Balance'}
          </span>
          <div className="mt-2 text-2xl font-bold text-white">
            {forecast.currentLiquidBalance.toLocaleString()} {currency}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {isFr ? 'Comptes courants inclus' : 'Included checking accounts'}
          </span>
        </div>

        {/* Upcoming Bills */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            {isFr ? 'Factures & Débits Prévus' : 'Upcoming Bills & Debits'}
          </span>
          <div className="mt-2 text-2xl font-bold text-rose-400">
            -{forecast.upcomingBillsTotal.toLocaleString()} {currency}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {isFr ? 'Échéances fixes programmées' : 'Scheduled recurring debits'}
          </span>
        </div>

        {/* Lowest Point */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            {isFr ? 'Creux de Trésorerie Estimé' : 'Lowest Projected Dip'}
          </span>
          <div
            className={`mt-2 text-2xl font-bold ${
              forecast.lowestBalance >= 500
                ? 'text-teal-400'
                : forecast.lowestBalance >= 0
                ? 'text-amber-400'
                : 'text-rose-400'
            }`}
          >
            {forecast.lowestBalance.toLocaleString()} {currency}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {isFr ? `Estimé le ${forecast.lowestBalanceDate}` : `Projected on ${forecast.lowestBalanceDate}`}
          </span>
        </div>
      </div>

      {/* Interactive Chart Container */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-white text-sm">
            {isFr ? 'Courbe d’Évolution de Trésorerie' : 'Cash Flow Trajectory Chart'}
          </h2>
          <span className="text-xs text-slate-400">
            {isFr
              ? 'Survolez ou cliquez sur la courbe pour examiner chaque date'
              : 'Hover or tap to inspect daily balance & scheduled events'}
          </span>
        </div>

        {/* SVG Interactive Graph */}
        <div className="relative h-64 w-full select-none">
          {(() => {
            if (timeline.length < 2) return null;

            const balances = timeline.map(t => t.balance);
            const minBal = Math.min(...balances, 0);
            const maxBal = Math.max(...balances, 1000);
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

            // Zero baseline if minBal < 0
            const zeroY = height - padding - ((0 - minBal) / range) * (height - 2 * padding);

            return (
              <svg
                className="w-full h-full overflow-visible"
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* Horizontal reference gridlines */}
                <line x1={padding} y1={height * 0.25} x2={width - padding} y2={height * 0.25} stroke="#1e293b" strokeDasharray="3 3" />
                <line x1={padding} y1={height * 0.5} x2={width - padding} y2={height * 0.5} stroke="#1e293b" strokeDasharray="3 3" />
                <line x1={padding} y1={height * 0.75} x2={width - padding} y2={height * 0.75} stroke="#1e293b" strokeDasharray="3 3" />

                {/* Zero line if applicable */}
                {minBal < 0 && zeroY >= padding && zeroY <= height - padding && (
                  <line
                    x1={padding}
                    y1={zeroY}
                    x2={width - padding}
                    y2={zeroY}
                    stroke="#f43f5e"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                )}

                {/* Area and Line */}
                <path d={areaD} fill="url(#cfGrad)" />
                <path d={pathD} fill="none" stroke="#2dd4bf" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                {/* Milestone Marker Nodes */}
                {points.map((p, idx) => {
                  const hasPayday = p.pt.isPayday;
                  const hasBill = p.pt.isBillDay;
                  const isLowest = p.pt.isLowestPoint;

                  if (!hasPayday && !hasBill && !isLowest) return null;

                  return (
                    <circle
                      key={idx}
                      cx={p.x}
                      cy={p.y}
                      r={isLowest ? 5 : 4}
                      fill={hasPayday ? '#10b981' : isLowest ? '#f43f5e' : '#f59e0b'}
                      stroke="#0f172a"
                      strokeWidth="2"
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
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={points[selectedPointIndex].x}
                      cy={points[selectedPointIndex].y}
                      r="6"
                      fill="#38bdf8"
                      stroke="#0f172a"
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
                      width={stepW}
                      height={height}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setSelectedPointIndex(idx)}
                      onClick={() => setSelectedPointIndex(idx)}
                    />
                  );
                })}
              </svg>
            );
          })()}
        </div>

        {/* Selected Scrubber Details Card */}
        {activePoint && (
          <div className="p-4 rounded-xl bg-slate-950/80 border border-teal-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-slate-400 font-medium block">
                {isFr ? 'Date sélectionnée :' : 'Inspected date:'}{' '}
                <strong className="text-white text-sm">{activePoint.dateStr}</strong>
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-slate-400">
                  {isFr ? 'Solde prévisionnel :' : 'Projected balance:'}
                </span>
                <span
                  className={`text-sm font-bold ${
                    activePoint.balance >= 0 ? 'text-teal-300' : 'text-rose-400'
                  }`}
                >
                  {activePoint.balance.toLocaleString()} {currency}
                </span>
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
                      className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px]"
                    >
                      <span className="text-slate-200 font-semibold">{ev.title}</span>
                      <span
                        className={`font-bold ${
                          ev.isExpense ? 'text-rose-400' : 'text-emerald-400'
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
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 font-bold text-sm text-white">
          {isFr ? 'Calendrier des Échéances Futures' : 'Scheduled Movement Calendar'}
        </div>

        <div className="divide-y divide-slate-800/60 max-h-96 overflow-y-auto">
          {timeline
            .filter(pt => pt.events.length > 0 || pt.isLowestPoint)
            .map((pt, idx) => (
              <div
                key={idx}
                className="p-3.5 hover:bg-slate-800/40 transition flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-200 w-20 shrink-0">{pt.dateStr}</span>
                  <div className="space-y-0.5">
                    {pt.events.map((e, eIdx) => (
                      <div key={eIdx} className="flex items-center gap-2">
                        <span className="text-white font-medium">{e.title}</span>
                        {e.categoryName && (
                          <span className="text-slate-400 text-[11px]">({e.categoryName})</span>
                        )}
                      </div>
                    ))}
                    {pt.isLowestPoint && (
                      <span className="text-[11px] font-semibold text-rose-400 flex items-center gap-1">
                        ★ {isFr ? 'Point le plus bas estimé du mois' : 'Lowest projected point'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`font-bold ${
                      pt.balance >= 0 ? 'text-teal-400' : 'text-rose-400'
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
    </div>
  );
};
