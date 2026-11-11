import React, { useState } from 'react';
import {
  Sliders,
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Tag
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { CategorizationRuleEntity, RuleMatchType } from '../types';
import { categorizeLabel } from '../utils/csvParser';
import { CategoryIcon } from '../components/CategoryIcon';

export const RulesScreen: React.FC = () => {
  const { rules, categories, budgets, addRule, updateRule, deleteRule, language } = useBudget();
  const isFr = language === 'fr';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CategorizationRuleEntity | null>(null);

  const [pattern, setPattern] = useState('');
  const [matchType, setMatchType] = useState<RuleMatchType>('CONTAINS');
  const [targetCatId, setTargetCatId] = useState<number>(categories[0]?.id || 1);
  const [targetBudgetId, setTargetBudgetId] = useState<number>(0);
  const [priority, setPriority] = useState<number>(10);

  // Test bench state
  const [testLabel, setTestLabel] = useState('CARREFOUR MARKET 9812');

  const testMatch = testLabel
    ? categorizeLabel(testLabel, rules, categories, budgets)
    : null;

  const handleOpenModal = (r?: CategorizationRuleEntity) => {
    if (r) {
      setEditingRule(r);
      setPattern(r.pattern);
      setMatchType(r.matchType);
      setTargetCatId(r.targetCategoryId);
      setTargetBudgetId(r.targetBudgetId);
      setPriority(r.priority);
    } else {
      setEditingRule(null);
      setPattern('');
      setMatchType('CONTAINS');
      setTargetCatId(categories[0]?.id || 1);
      setTargetBudgetId(0);
      setPriority(10);
    }
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim()) return;

    const cat = categories.find(c => c.id === targetCatId);
    const budget = budgets.find(b => b.id === targetBudgetId);

    if (editingRule) {
      updateRule({
        ...editingRule,
        pattern: pattern.trim(),
        matchType,
        targetCategoryId: targetCatId,
        targetCategoryName: cat?.name || editingRule.targetCategoryName,
        targetBudgetId,
        targetBudgetTitle: budget?.title || 'General',
        priority
      });
    } else {
      addRule({
        pattern: pattern.trim(),
        matchType,
        targetCategoryId: targetCatId,
        targetCategoryName: cat?.name || 'General',
        targetBudgetId,
        targetBudgetTitle: budget?.title || 'General',
        priority,
        isActive: true
      });
    }

    setIsModalOpen(false);
  };

  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {isFr ? 'Règles d’Auto-Catégorisation' : 'Auto-Categorization Rules'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {isFr
              ? 'Assignation automatique de catégorie et de poste budgétaire lors de l’importation de relevés'
              : 'Automatically assigns envelopes and budget lines to imported bank statement lines'}
          </p>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-teal-500/20 transition active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>{isFr ? 'Nouvelle Règle' : 'New Rule'}</span>
        </button>
      </div>

      {/* Interactive Live Test Bench */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 shadow-lg">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            {isFr ? 'Banc d’Essai en Direct' : 'Live Rule Simulator'}
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <input
            type="text"
            placeholder={isFr ? 'Tapez un libellé de test...' : 'Type a test bank label...'}
            value={testLabel}
            onChange={e => setTestLabel(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-teal-500"
          />

          {testMatch && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-teal-500/10 border border-teal-500/30 text-xs">
              <span className="text-slate-400">{isFr ? 'Résultat :' : 'Matched:'}</span>
              <span className="font-bold text-teal-300 flex items-center gap-1">
                <CategoryIcon name={testMatch.categoryIcon} className="w-3.5 h-3.5" />
                {testMatch.categoryName}
              </span>
              {testMatch.budgetTitle && testMatch.budgetTitle !== 'General' && (
                <span className="text-slate-300 font-medium">({testMatch.budgetTitle})</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Rules Table */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">{isFr ? 'Priorité' : 'Priority'}</th>
                <th className="py-3 px-4">{isFr ? 'Mot-clé / Motif (Pattern)' : 'Pattern'}</th>
                <th className="py-3 px-4">{isFr ? 'Type de Match' : 'Match Type'}</th>
                <th className="py-3 px-4">{isFr ? 'Catégorie Cible' : 'Target Category'}</th>
                <th className="py-3 px-4">{isFr ? 'Sous-Budget' : 'Sub-Budget'}</th>
                <th className="py-3 px-4 text-right">{isFr ? 'Actions' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {sortedRules.map(r => (
                <tr key={r.id} className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 border border-slate-700 text-teal-300 font-mono">
                      {r.priority}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-white max-w-xs truncate">
                    {r.pattern}
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 border border-slate-700 text-slate-300">
                      {r.matchType}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-200">{r.targetCategoryName}</td>
                  <td className="py-3 px-4 text-slate-400">{r.targetBudgetTitle || 'General'}</td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => handleOpenModal(r)}
                      className="p-1 rounded text-slate-400 hover:text-slate-200 transition mr-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteRule(r.id)}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-white">
              {editingRule
                ? isFr
                  ? 'Modifier la règle'
                  : 'Edit Rule'
                : isFr
                ? 'Nouvelle règle d’auto-catégorisation'
                : 'New Categorization Rule'}
            </h2>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {isFr ? 'Mot-clé ou Expression Régulière (Pattern)' : 'Pattern (Keyword or Regex)'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: CARREFOUR|AUCHAN ou EDF"
                  value={pattern}
                  onChange={e => setPattern(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {isFr ? 'Type de correspondance' : 'Match Type'}
                  </label>
                  <select
                    value={matchType}
                    onChange={e => setMatchType(e.target.value as RuleMatchType)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="CONTAINS">CONTAINS (Contient)</option>
                    <option value="STARTS_WITH">STARTS_WITH (Commence par)</option>
                    <option value="EXACT">EXACT (Exact)</option>
                    <option value="REGEX">REGEX (RegEx avancée)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {isFr ? 'Priorité (Ordre)' : 'Priority'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={priority}
                    onChange={e => setPriority(parseInt(e.target.value, 10) || 10)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {isFr ? 'Catégorie Cible' : 'Target Category'}
                  </label>
                  <select
                    value={targetCatId}
                    onChange={e => {
                      const id = parseInt(e.target.value, 10);
                      setTargetCatId(id);
                      const b = budgets.find(bg => bg.categoryId === id);
                      setTargetBudgetId(b?.id || 0);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {isFr ? 'Sous-budget cible' : 'Target Budget Line'}
                  </label>
                  <select
                    value={targetBudgetId}
                    onChange={e => setTargetBudgetId(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value={0}>{isFr ? 'Général' : 'General'}</option>
                    {budgets
                      .filter(b => b.categoryId === targetCatId)
                      .map(b => (
                        <option key={b.id} value={b.id}>
                          {b.title}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 transition"
                >
                  {isFr ? 'Annuler' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-md transition"
                >
                  {isFr ? 'Enregistrer' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
