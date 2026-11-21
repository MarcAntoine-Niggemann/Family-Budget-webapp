import React, { useState } from 'react';
import {
  Copy,
  FlaskConical,
  Pencil,
  Plus,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { SimulationManagerModal, SimulationModalMode } from './SimulationManagerModal';

const PLANNING_SCREENS = new Set([
  'DASHBOARD',
  'BUDGET_PLANNER',
  'REPORTS',
  'CUSTOM_FORECAST'
]);

export const SimulationScenarioBar: React.FC = () => {
  const {
    simulations,
    activeSimulationId,
    activeSimulation,
    setActiveSimulationId,
    duplicateSimulation,
    currentScreen,
    language
  } = useBudget();

  const isFr = language === 'fr';
  const [modalMode, setModalMode] = useState<SimulationModalMode | null>(null);

  const shouldRender = activeSimulation !== null || PLANNING_SCREENS.has(currentScreen);
  if (!shouldRender) {
    return null;
  }

  const isPlanningScreen = PLANNING_SCREENS.has(currentScreen);
  const simCategoriesCount = activeSimulation
    ? activeSimulation.categories.filter(c => !c.isDeleted).length
    : 0;
  const simBudgetsCount = activeSimulation
    ? activeSimulation.budgets.filter(b => !b.isDeleted).length
    : 0;

  return (
    <>
      <div
        className={`border-b transition-colors duration-200 ${
          activeSimulation
            ? 'bg-indigo-50/95 dark:bg-indigo-950/45 border-indigo-200 dark:border-indigo-500/35'
            : 'bg-white/80 dark:bg-slate-900/70 border-slate-200 dark:border-slate-800/80'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          {/* Left: Mode Indicator & Context */}
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                activeSimulation
                  ? 'bg-indigo-600 text-white dark:bg-indigo-500 dark:text-white'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5" />
            </div>

            <div className="min-w-0">
              {activeSimulation ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  <span className="font-bold text-indigo-900 dark:text-indigo-200 truncate">
                    {isFr ? 'Simulation active :' : 'Simulating:'} {activeSimulation.name}
                  </span>
                  <span className="text-indigo-700/80 dark:text-indigo-300/80 font-mono tabular-nums text-[11px]">
                    · {simCategoriesCount} {isFr ? 'cat.' : 'cat.'} · {simBudgetsCount}{' '}
                    {isFr ? 'lignes' : 'lines'}
                  </span>
                  {activeSimulation.clonedFromName && (
                    <span className="hidden lg:inline text-[11px] text-indigo-700/75 dark:text-indigo-300/75">
                      · {isFr ? 'Copiée depuis' : 'From'} {activeSimulation.clonedFromName}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {isFr ? 'Budget Actuel (Live)' : 'Live Budget'}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    ·{' '}
                    {simulations.length > 0
                      ? isFr
                        ? `${simulations.length} scénario(s) « Et si ? » enregistré(s)`
                        : `${simulations.length} saved "What-If" scenario(s)`
                      : isFr
                      ? 'Testez des projets (immobilier, épargne…) sans modifier le budget réel'
                      : 'Test scenarios (real estate, savings…) without altering your real budget'}
                  </span>
                </div>
              )}

              {activeSimulation && !isPlanningScreen && (
                <p className="text-[11px] text-indigo-700/85 dark:text-indigo-300/85 mt-0.5">
                  {isFr
                    ? 'Les opérations réelles et règles restent strictement liées au budget Live.'
                    : 'Real transactions and auto-rules remain strictly isolated on your Live budget.'}
                </p>
              )}
              {activeSimulation?.description && isPlanningScreen && (
                <p className="text-[11px] text-indigo-800/80 dark:text-indigo-200/80 truncate max-w-2xl mt-0.5">
                  {activeSimulation.description}
                </p>
              )}
            </div>
          </div>

          {/* Right: Scenario Selector & Actions */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <select
              aria-label={isFr ? 'Sélectionner un scénario budgétaire' : 'Select budget scenario'}
              value={activeSimulationId || 'LIVE'}
              onChange={e =>
                setActiveSimulationId(e.target.value === 'LIVE' ? null : e.target.value)
              }
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none cursor-pointer max-w-[230px] truncate ${
                activeSimulation
                  ? 'bg-white dark:bg-slate-900 border-indigo-300 dark:border-indigo-500/50 text-indigo-900 dark:text-indigo-100'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
              }`}
            >
              <option value="LIVE">
                {isFr ? 'Budget Actuel (Live)' : 'Live Budget (Actual)'}
              </option>
              {simulations.map(sim => (
                <option key={sim.id} value={sim.id}>
                  {isFr ? 'Et si :' : 'What-If:'} {sim.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() =>
                setModalMode({
                  type: 'CREATE',
                  defaultSourceId: activeSimulation ? activeSimulation.id : 'LIVE'
                })
              }
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isFr ? 'Nouvelle Simulation' : 'New What-If'}</span>
            </button>

            {activeSimulation && (
              <>
                <button
                  type="button"
                  onClick={() => duplicateSimulation(activeSimulation.id)}
                  title={isFr ? 'Dupliquer ce scénario' : 'Duplicate scenario'}
                  className="p-1.5 rounded-lg bg-white hover:bg-indigo-100/70 dark:bg-slate-900 dark:hover:bg-slate-800 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 transition shrink-0 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setModalMode({ type: 'RENAME', simulation: activeSimulation })}
                  title={isFr ? 'Renommer ce scénario' : 'Rename scenario'}
                  className="p-1.5 rounded-lg bg-white hover:bg-indigo-100/70 dark:bg-slate-900 dark:hover:bg-slate-800 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 transition shrink-0 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setModalMode({ type: 'DELETE', simulation: activeSimulation })}
                  title={isFr ? 'Supprimer ce scénario' : 'Delete scenario'}
                  className="p-1.5 rounded-lg bg-white hover:bg-rose-50 dark:bg-slate-900 dark:hover:bg-rose-500/15 border border-indigo-200 hover:border-rose-300 dark:border-indigo-500/30 dark:hover:border-rose-500/40 text-slate-600 hover:text-rose-600 dark:text-slate-300 dark:hover:text-rose-400 transition shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSimulationId(null)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-indigo-200 dark:border-indigo-500/40 text-indigo-800 dark:text-indigo-200 text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isFr ? 'Revenir au Live' : 'Exit to Live'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <SimulationManagerModal mode={modalMode} onClose={() => setModalMode(null)} />
    </>
  );
};
