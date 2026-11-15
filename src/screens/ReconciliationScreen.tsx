import React from 'react';
import {
  GitCompare,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Clock,
  Sparkles,
  Link,
  Tag,
  Calendar,
  Wallet
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { findReconciliationCandidates } from '../utils/reconciliationEngine';
import { CategoryIcon } from '../components/CategoryIcon';

export const ReconciliationScreen: React.FC = () => {
  const { transactions, reconcilePair, currency, language, navigateTo } = useBudget();
  const isFr = language === 'fr';

  const candidates = findReconciliationCandidates(transactions);

  const pendingManual = transactions.filter(
    tx => !tx.isDeleted && tx.source === 'MANUAL' && tx.status === 'PENDING'
  );

  const reconciledCount = transactions.filter(
    tx => !tx.isDeleted && tx.status === 'RECONCILED'
  ).length;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {isFr ? 'Rapprochement Bancaire Automatique' : 'Automated Bank Reconciliation'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {isFr
              ? 'Fusionne les déclarations manuelles sur le vif avec les relevés bancaires importés pour éliminer les doublons'
              : 'Matches on-the-go manual expenses with imported bank statements to prevent double-counting in reports'}
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
            {isFr ? 'Rapprochées :' : 'Reconciled:'}{' '}
            <strong className="text-emerald-400 font-bold">{reconciledCount / 2}</strong>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
            {isFr ? 'En attente banque :' : 'Pending manual:'}{' '}
            <strong className="text-amber-400 font-bold">{pendingManual.length}</strong>
          </div>
        </div>
      </div>

      {/* Matched Candidates Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            {isFr ? 'Paires Correspondantes Détectées' : 'Matching Candidates Found'} (
            {candidates.length})
          </h2>
        </div>

        {candidates.length === 0 ? (
          <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-teal-400 mx-auto" />
            <h3 className="font-bold text-white text-sm">
              {isFr
                ? 'Aucune paire en attente de rapprochement'
                : 'No pending reconciliation matches right now'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {isFr
                ? 'Toutes les dépenses manuelles éligibles ont été rapprochées avec les relevés bancaires importés.'
                : 'All manual expenses matching imported bank records have been reconciled.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {candidates.map((cand, idx) => {
              const manualDate = new Date(cand.manualTx.date).toLocaleDateString(
                isFr ? 'fr-FR' : 'en-US',
                { day: 'numeric', month: 'short' }
              );
              const bankDate = new Date(cand.bankTx.date).toLocaleDateString(
                isFr ? 'fr-FR' : 'en-US',
                { day: 'numeric', month: 'short' }
              );

              return (
                <div
                  key={idx}
                  className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4 hover:border-slate-700 transition"
                >
                  {/* Confidence Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                        {isFr ? `Confiance : ${cand.confidenceScore}%` : `Confidence: ${cand.confidenceScore}%`}
                      </span>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        {cand.reasons.map((r, rIdx) => (
                          <span key={rIdx} className="hidden sm:inline-block">
                            • {r}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => reconcilePair(cand.manualTx.id, cand.bankTx.id)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-teal-500/20 transition active:scale-95"
                    >
                      <Link className="w-3.5 h-3.5" />
                      <span>{isFr ? 'Rapprocher & Fusionner' : 'Reconcile & Link'}</span>
                    </button>
                  </div>

                  {/* Side-by-side comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Manual declaration */}
                    <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">
                        {isFr ? '📱 Saisie Manuelle sur le vif' : '📱 On-The-Go Manual Entry'}
                      </span>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-white">{cand.manualTx.title}</span>
                        <span className="font-bold font-mono tabular-nums text-sm text-slate-100">
                          {cand.manualTx.amount.toFixed(2)} {currency}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                        <span>{manualDate}</span>
                        <span>·</span>
                        <span>{cand.manualTx.familyMemberName}</span>
                        <span>·</span>
                        <span>
                          {cand.manualTx.categoryName
                            ? cand.manualTx.budgetTitle
                              ? `${cand.manualTx.categoryName} · ${cand.manualTx.budgetTitle}`
                              : cand.manualTx.categoryName
                            : isFr
                            ? 'À catégoriser'
                            : 'Unassigned'}
                        </span>
                      </div>
                      {cand.manualTx.notes && (
                        <p className="text-[11px] text-teal-400/80 italic">
                          💬 {cand.manualTx.notes}
                        </p>
                      )}
                    </div>

                    {/* Bank imported record */}
                    <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-teal-400 tracking-wider">
                        {isFr ? '🏦 Relevé Bancaire Importé' : '🏦 Imported Bank Statement'}
                      </span>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-white">{cand.bankTx.title}</span>
                        <span className="font-bold font-mono tabular-nums text-sm text-slate-100">
                          {cand.bankTx.amount.toFixed(2)} {currency}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>{bankDate}</span>
                        <span>•</span>
                        <span>{cand.bankTx.accountName}</span>
                        <span>•</span>
                        <span className="font-mono text-[11px] text-slate-500 truncate">
                          {cand.bankTx.originalBankLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending Manual Declarations Table */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl space-y-3 p-5">
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          {isFr
            ? 'Dépenses Manuelles en Attente de Rapprochement'
            : 'Pending Manual Expenses Waiting for Statement'}
        </h2>

        {pendingManual.length === 0 ? (
          <p className="text-xs text-slate-500 py-2">
            {isFr
              ? 'Aucune dépense manuelle en attente.'
              : 'No pending manual declarations.'}
          </p>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {pendingManual.map(tx => {
              const formattedDate = new Date(tx.date).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', {
                day: 'numeric',
                month: 'short'
              });
              return (
                <div key={tx.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="w-16 font-semibold text-slate-400">{formattedDate}</span>
                    <div>
                      <span className="font-bold text-white">{tx.title}</span>
                      <span className="text-slate-400 ml-2">({tx.familyMemberName})</span>
                    </div>
                  </div>
                  <span className="font-bold text-slate-100">
                    {tx.amount.toFixed(2)} {currency}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
