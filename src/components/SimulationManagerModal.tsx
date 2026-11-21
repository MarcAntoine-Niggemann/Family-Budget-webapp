import React, { useEffect, useState } from 'react';
import { Copy, FlaskConical, Pencil, Trash2, X } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { BudgetSimulationEntity } from '../types';

export type SimulationModalMode =
  | { type: 'CREATE'; defaultSourceId?: 'LIVE' | string }
  | { type: 'RENAME'; simulation: BudgetSimulationEntity }
  | { type: 'DELETE'; simulation: BudgetSimulationEntity };

interface SimulationManagerModalProps {
  mode: SimulationModalMode | null;
  onClose: () => void;
}

export const SimulationManagerModal: React.FC<SimulationManagerModalProps> = ({
  mode,
  onClose
}) => {
  const {
    simulations,
    categories,
    budgets,
    language,
    createSimulation,
    renameSimulation,
    deleteSimulation
  } = useBudget();

  const isFr = language === 'fr';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceId, setSourceId] = useState<'LIVE' | string>('LIVE');

  useEffect(() => {
    if (!mode) return;
    if (mode.type === 'CREATE') {
      const defSrc = mode.defaultSourceId || 'LIVE';
      setSourceId(defSrc);
      const srcSim = defSrc !== 'LIVE' ? simulations.find(s => s.id === defSrc) : null;
      setName(
        srcSim
          ? `${srcSim.name} (${isFr ? 'Variante' : 'Variant'})`
          : ''
      );
      setDescription(srcSim?.description || '');
    } else if (mode.type === 'RENAME') {
      setName(mode.simulation.name);
      setDescription(mode.simulation.description || '');
    }
  }, [mode, simulations, isFr]);

  if (!mode) return null;

  const liveCatCount = categories.filter(c => !c.isDeleted).length;
  const liveBudgetCount = budgets.filter(b => !b.isDeleted).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode.type === 'CREATE') {
      if (!name.trim()) return;
      createSimulation({
        name: name.trim(),
        description: description.trim() || undefined,
        sourceId
      });
      onClose();
    } else if (mode.type === 'RENAME') {
      if (!name.trim()) return;
      renameSimulation(mode.simulation.id, name.trim(), description.trim() || null);
      onClose();
    }
  };

  if (mode.type === 'DELETE') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/70 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {isFr ? 'Supprimer cette simulation ?' : 'Delete this simulation?'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {mode.simulation.name}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
              aria-label={isFr ? 'Fermer' : 'Close'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {isFr
              ? 'Cette simulation et ses lignes budgétaires propres seront supprimées. Votre budget Live et vos transactions réelles restent intacts.'
              : 'This simulation and its custom budget lines will be removed. Your Live budget and real transactions remain untouched.'}
          </p>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => {
                deleteSimulation(mode.simulation.id);
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isFr ? 'Supprimer' : 'Delete Simulation'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isCreate = mode.type === 'CREATE';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
              {isCreate ? <FlaskConical className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {isCreate
                  ? isFr
                    ? 'Nouvelle Simulation « Et si ? »'
                    : 'New "What-If" Simulation'
                  : isFr
                  ? 'Renommer la simulation'
                  : 'Rename Simulation'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isCreate
                  ? isFr
                    ? 'Copiez votre budget Live ou un scénario existant sans modifier vos comptes réels.'
                    : 'Clone your Live budget or an existing scenario without touching your real ledger.'
                  : isFr
                  ? 'Mettez à jour le nom ou la description de ce scénario.'
                  : 'Update the scenario name or notes.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
            aria-label={isFr ? 'Fermer' : 'Close'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {isFr ? 'Nom du scénario' : 'Scenario Name'}
            </label>
            <input
              type="text"
              required
              maxLength={120}
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={
                isFr
                  ? 'Ex : Investissement Locatif, Congé Parental, Nouvelle Voiture...'
                  : 'e.g. Real Estate Investment, Parental Leave, New Car...'
              }
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {isCreate && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {isFr ? 'Base de départ à copier' : 'Copy Budget From'}
              </label>
              <div className="relative">
                <select
                  value={sourceId}
                  onChange={e => setSourceId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="LIVE">
                    {isFr
                      ? `Budget Actuel (Live) · ${liveCatCount} cat. · ${liveBudgetCount} lignes`
                      : `Live Budget · ${liveCatCount} cat. · ${liveBudgetCount} lines`}
                  </option>
                  {simulations.map(sim => {
                    const catCount = sim.categories.filter(c => !c.isDeleted).length;
                    const bgtCount = sim.budgets.filter(b => !b.isDeleted).length;
                    return (
                      <option key={sim.id} value={sim.id}>
                        {isFr ? 'Simulation :' : 'Simulation:'} {sim.name} · {catCount} cat. · {bgtCount}{' '}
                        {isFr ? 'lignes' : 'lines'}
                      </option>
                    );
                  })}
                </select>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Copy className="w-3 h-3 text-indigo-500 shrink-0" />
                <span>
                  {isFr
                    ? 'Toutes les catégories et sous-catégories copiées pourront être modifiées librement.'
                    : 'All cloned categories and budget lines can be freely edited inside this scenario.'}
                </span>
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {isFr ? 'Hypothèses / Notes (optionnel)' : 'Assumptions / Notes (optional)'}
            </label>
            <textarea
              rows={2}
              maxLength={500}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={
                isFr
                  ? 'Ex : Crédit immo 850 €/mois + loyer perçu 1 100 €/mois + taxe foncière 1 200 €/an'
                  : 'e.g. Mortgage 850/mo + rental income 1,100/mo + property tax 1,200/yr'
              }
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white font-bold text-xs shadow-sm transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isCreate
                ? isFr
                  ? 'Créer & Activer'
                  : 'Create & Activate'
                : isFr
                ? 'Enregistrer'
                : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
