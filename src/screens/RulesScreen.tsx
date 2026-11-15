import React, { useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, Sparkles, AlertCircle, X, Power } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { CategorizationRuleEntity, RuleMatchType } from '../types';
import { categorizeLabel } from '../utils/csvParser';
import { CategoryIcon } from '../components/CategoryIcon';

export const RulesScreen: React.FC = () => {
  const { rules, categories, budgets, addRule, updateRule, deleteRule, navigateTo, language } = useBudget();
  const isFr = language === 'fr';

  const activeCategories = useMemo(() => categories.filter(c => !c.isDeleted), [categories]);
  const activeBudgets = useMemo(() => budgets.filter(b => !b.isDeleted && b.isActive), [budgets]);
  const activeRules = useMemo(() => rules.filter(r => !r.isDeleted), [rules]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CategorizationRuleEntity | null>(null);

  const [pattern, setPattern] = useState('');
  const [matchType, setMatchType] = useState<RuleMatchType>('CONTAINS');
  const [targetCatId, setTargetCatId] = useState<number>(0);
  const [targetBudgetId, setTargetBudgetId] = useState<number>(0);
  const [priorityStr, setPriorityStr] = useState<string>('10');
  const [ruleIsActive, setRuleIsActive] = useState<boolean>(true);

  // Test bench state
  const [testLabel, setTestLabel] = useState('CARREFOUR MARKET 9812');

  const testMatch = testLabel
    ? categorizeLabel(testLabel, activeRules, activeCategories, activeBudgets)
    : null;

  const targetCategoryBudgets = useMemo(
    () => activeBudgets.filter(b => b.categoryId === targetCatId),
    [activeBudgets, targetCatId]
  );

  const handleOpenModal = (r?: CategorizationRuleEntity) => {
    if (r) {
      const catExists = activeCategories.some(c => c.id === r.targetCategoryId);
      const resolvedCatId = catExists ? r.targetCategoryId : 0;
      const budgetExistsInCat =
        resolvedCatId > 0 &&
        activeBudgets.some(b => b.id === r.targetBudgetId && b.categoryId === resolvedCatId);

      setEditingRule(r);
      setPattern(r.pattern);
      setMatchType(r.matchType);
      setTargetCatId(resolvedCatId);
      setTargetBudgetId(budgetExistsInCat ? r.targetBudgetId : 0);
      setPriorityStr(String(Number.isFinite(r.priority) ? r.priority : 10));
      setRuleIsActive(r.isActive !== false);
    } else {
      const defaultCat =
        activeCategories.find(c => activeBudgets.some(b => b.categoryId === c.id)) || activeCategories[0];
      const defaultCatId = defaultCat?.id || 0;
      const firstBudget = activeBudgets.find(b => b.categoryId === defaultCatId);
      setEditingRule(null);
      setPattern('');
      setMatchType('CONTAINS');
      setTargetCatId(defaultCatId);
      setTargetBudgetId(firstBudget?.id || 0);
      setPriorityStr('10');
      setRuleIsActive(true);
    }
    setIsModalOpen(true);
  };

  const parsedPriority = parseInt(priorityStr, 10);
  const isPriorityValid = !Number.isNaN(parsedPriority) && parsedPriority >= 1;

  const regexError = useMemo(() => {
    if (matchType !== 'REGEX' || !pattern.trim()) return null;
    try {
      new RegExp(pattern.trim(), 'i');
      return null;
    } catch (err: any) {
      return err?.message || (isFr ? 'Expression régulière invalide' : 'Invalid regular expression');
    }
  }, [matchType, pattern, isFr]);

  const selectedCategory = activeCategories.find(c => c.id === targetCatId);
  const selectedBudget = targetCategoryBudgets.find(b => b.id === targetBudgetId);
  const canSave = Boolean(
    pattern.trim() && selectedCategory && selectedBudget && isPriorityValid && !regexError
  );

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || !selectedCategory || !selectedBudget) return;

    const cleanPattern = pattern.trim();
    const finalPriority = Math.max(1, parsedPriority);

    if (editingRule) {
      updateRule({
        ...editingRule,
        pattern: cleanPattern,
        matchType,
        targetCategoryId: selectedCategory.id,
        targetCategoryName: selectedCategory.name,
        targetBudgetId: selectedBudget.id,
        targetBudgetTitle: selectedBudget.title,
        priority: finalPriority,
        isActive: ruleIsActive
      });
    } else {
      addRule({
        pattern: cleanPattern,
        matchType,
        targetCategoryId: selectedCategory.id,
        targetCategoryName: selectedCategory.name,
        targetBudgetId: selectedBudget.id,
        targetBudgetTitle: selectedBudget.title,
        priority: finalPriority,
        isActive: ruleIsActive
      });
    }

    setIsModalOpen(false);
  };

  const handleToggleRuleActive = (r: CategorizationRuleEntity) => {
    updateRule({
      ...r,
      isActive: !r.isActive
    });
  };

  const sortedRules = [...activeRules].sort((a, b) => b.priority - a.priority);

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
              ? 'Assignation automatique vers une catégorie et une sous-catégorie budgétaire lors des imports'
              : 'Automatically assigns both a category wrapper and a sub-category budget line to imported statements'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleOpenModal()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-teal-500/20 transition active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
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
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400">{isFr ? 'Résultat :' : 'Matched:'}</span>
              {testMatch.categoryId > 0 && testMatch.budgetId > 0 ? (
                <span className="font-semibold text-teal-300 flex items-center gap-1.5">
                  <CategoryIcon name={testMatch.categoryIcon} className="w-3.5 h-3.5" />
                  <span>{testMatch.categoryName}</span>
                  <span aria-hidden="true" className="text-slate-500">·</span>
                  <span className="text-slate-200">{testMatch.budgetTitle}</span>
                </span>
              ) : (
                <span className="text-amber-300 font-semibold">
                  {isFr ? 'Aucune règle correspondante (Non assigné)' : 'No matching rule (Unassigned)'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Rules Card Grid */}
      {sortedRules.length === 0 ? (
        <div className="p-10 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-3">
          <p className="text-sm text-slate-400">
            {isFr
              ? 'Aucune règle configurée. Créez votre première règle pour automatiser la catégorisation des imports.'
              : 'No rules configured yet. Create your first rule to automate categorization during imports.'}
          </p>
          <button
            type="button"
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{isFr ? 'Nouvelle Règle' : 'New Rule'}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedRules.map(r => {
            const matchedCat = activeCategories.find(c => c.id === r.targetCategoryId);
            const hasCategory = r.targetCategoryId > 0 && Boolean(r.targetCategoryName);
            const hasBudget = r.targetBudgetId > 0 && Boolean(r.targetBudgetTitle);

            return (
              <article
                key={r.id}
                className={`p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between gap-4 ${
                  !r.isActive ? 'opacity-65' : ''
                }`}
              >
                {/* Top: Pattern + Edit/Delete Actions */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <h3 className="font-mono font-bold text-sm text-white break-words leading-snug">
                      {r.pattern}
                    </h3>

                    {/* Target Category · Sub-category */}
                    <div className="flex items-center gap-1.5 text-xs flex-wrap">
                      {matchedCat && (
                        <CategoryIcon
                          name={matchedCat.icon}
                          className="w-3.5 h-3.5 text-teal-400 shrink-0"
                        />
                      )}
                      {hasCategory ? (
                        <span className="text-slate-200 font-medium">{r.targetCategoryName}</span>
                      ) : (
                        <span className="text-amber-400 font-semibold">
                          {isFr ? 'Catégorie requise' : 'Category required'}
                        </span>
                      )}
                      <span aria-hidden="true" className="text-slate-600">
                        ·
                      </span>
                      {hasBudget ? (
                        <span className="text-slate-300">{r.targetBudgetTitle}</span>
                      ) : (
                        <span className="text-amber-400 font-semibold">
                          {isFr ? 'Sous-catégorie requise' : 'Sub-category required'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenModal(r)}
                      aria-label={isFr ? `Modifier la règle ${r.pattern}` : `Edit rule ${r.pattern}`}
                      title={isFr ? 'Modifier la règle' : 'Edit rule'}
                      className="p-2 rounded-lg text-slate-400 hover:text-teal-300 hover:bg-slate-800 transition cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRule(r.id)}
                      aria-label={isFr ? `Supprimer la règle ${r.pattern}` : `Delete rule ${r.pattern}`}
                      title={isFr ? 'Supprimer la règle' : 'Delete rule'}
                      className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Bottom: Priority · Match Type & Active Toggle */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono tabular-nums font-semibold text-teal-300 whitespace-nowrap">
                      {isFr ? 'Priorité' : 'Priority'} {r.priority}
                    </span>
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 truncate">
                      {r.matchType}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleRuleActive(r)}
                    title={
                      r.isActive
                        ? isFr
                          ? 'Désactiver cette règle'
                          : 'Pause this rule'
                        : isFr
                        ? 'Activer cette règle'
                        : 'Activate this rule'
                    }
                    className={`inline-flex items-center gap-1.5 text-[11px] font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                      r.isActive
                        ? 'text-emerald-400 hover:text-emerald-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>
                      {r.isActive
                        ? isFr
                          ? 'Active'
                          : 'Active'
                        : isFr
                        ? 'En pause'
                        : 'Paused'}
                    </span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-white">
                {editingRule
                  ? isFr
                    ? 'Modifier la règle'
                    : 'Edit Rule'
                  : isFr
                  ? 'Nouvelle règle d’auto-catégorisation'
                  : 'New Categorization Rule'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label={isFr ? 'Fermer' : 'Close'}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

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
                {regexError && (
                  <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{regexError}</span>
                  </p>
                )}
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
                    <option value="CONTAINS">
                      {isFr ? 'CONTAINS (Contient)' : 'CONTAINS (Contains)'}
                    </option>
                    <option value="STARTS_WITH">
                      {isFr ? 'STARTS_WITH (Commence par)' : 'STARTS_WITH (Starts with)'}
                    </option>
                    <option value="EXACT">
                      {isFr ? 'EXACT (Exact)' : 'EXACT (Exact match)'}
                    </option>
                    <option value="REGEX">
                      {isFr ? 'REGEX (Expression régulière)' : 'REGEX (Regular expression)'}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {isFr ? 'Priorité (Ordre)' : 'Priority'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={priorityStr}
                    onChange={e => setPriorityStr(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-teal-500"
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
                      const firstSub = activeBudgets.find(bg => bg.categoryId === id);
                      setTargetBudgetId(firstSub?.id || 0);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value={0}>
                      {isFr ? 'Sélectionner une catégorie...' : 'Select a category...'}
                    </option>
                    {activeCategories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {isFr ? 'Sous-catégorie (obligatoire)' : 'Target Sub-category (required)'}
                  </label>
                  <select
                    value={targetBudgetId}
                    disabled={targetCatId === 0 || targetCategoryBudgets.length === 0}
                    onChange={e => setTargetBudgetId(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500 disabled:opacity-50"
                  >
                    <option value={0}>
                      {targetCatId === 0
                        ? isFr
                          ? 'Choisir une catégorie'
                          : 'Select category first'
                        : targetCategoryBudgets.length === 0
                        ? isFr
                          ? 'Aucune sous-catégorie'
                          : 'No sub-categories'
                        : isFr
                        ? 'Sélectionner une sous-catégorie...'
                        : 'Select a sub-category...'}
                    </option>
                    {targetCategoryBudgets.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {targetCatId > 0 && targetCategoryBudgets.length === 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      {isFr
                        ? 'Cette catégorie ne contient aucune sous-catégorie. Créez-en une dans le Planificateur avant d’enregistrer.'
                        : 'This category has no sub-categories. Create one in Budget Planner before saving.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      navigateTo('BUDGET_PLANNER');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold whitespace-nowrap shrink-0 transition cursor-pointer"
                  >
                    {isFr ? 'Planificateur' : 'Budget Planner'}
                  </button>
                </div>
              )}

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer">
                <span className="text-xs font-medium text-slate-200">
                  {isFr ? 'Règle active lors des imports' : 'Rule active during imports'}
                </span>
                <input
                  type="checkbox"
                  checked={ruleIsActive}
                  onChange={e => setRuleIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-teal-500 bg-slate-900 border-slate-700 focus:ring-teal-500"
                />
              </label>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 transition cursor-pointer"
                >
                  {isFr ? 'Annuler' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={!canSave}
                  className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-bold text-sm shadow-md transition cursor-pointer"
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

