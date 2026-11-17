import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Tag,
  Wallet,
  Sliders,
  Sparkles,
  ArrowRight,
  Zap,
  Key,
  RefreshCw,
  Building2,
  ExternalLink,
  HelpCircle,
  ShieldCheck,
  Check,
  Copy
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { parseBankStatementCsv, detectCsvDuplicates, CsvParseResult } from '../utils/csvParser';
import { CategoryIcon } from '../components/CategoryIcon';
import { OpenBankingConfigModal } from '../components/OpenBankingConfigModal';

export const CsvImportScreen: React.FC = () => {
  const {
    sessionMode,
    accounts,
    rules,
    categories,
    budgets,
    transactions,
    currency,
    language,
    importCsvTransactions,
    openBankingConfig,
    syncOpenBankingNow,
    navigateTo
  } = useBudget();

  const isFr = language === 'fr';

  const activeAccounts = accounts.filter(a => !a.isDeleted);
  const activeCategories = categories.filter(c => !c.isDeleted);
  const activeBudgets = budgets.filter(b => !b.isDeleted);
  const activeRules = rules.filter(r => !r.isDeleted);

  const [activeTab, setActiveTab] = useState<'CSV' | 'OPEN_BANKING'>('CSV');
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  // CSV States
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rawCsvText, setRawCsvText] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(activeAccounts[0]?.id || 'acc_main_checking');
  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const duplicateMap = useMemo(() => {
    if (!parseResult || parseResult.parsedRecords.length === 0) {
      return new Map();
    }
    return detectCsvDuplicates(parseResult.parsedRecords, transactions, selectedAccountId);
  }, [parseResult, transactions, selectedAccountId]);

  useEffect(() => {
    if (!parseResult) {
      setSelectedRowIds(new Set());
      return;
    }
    const nonDuplicateIds = new Set(
      parseResult.parsedRecords
        .filter(r => !duplicateMap.get(r.id)?.isDuplicate)
        .map(r => r.id)
    );
    setSelectedRowIds(nonDuplicateIds);
  }, [parseResult, duplicateMap]);

  const sampleCsvCheckingFr = `Date;Libelle;Montant;Solde
12/11/2026;CARREFOUR MARKET ST MARTIN;-85.40;4164.60
11/11/2026;TOTAL RELAIS AUTOROUTE;-62.50;4250.00
10/11/2026;PRLV ORANGE FIBRE INTERNET;-60.00;4312.50
08/11/2026;PHARMACIE CENTRALE GARE;-24.80;4372.50
05/11/2026;PRLV EDF ELECTRICITE DE FRANCE;-140.00;4397.30
01/11/2026;PRLV ECHEANCE PRET IMMO BANQUE;-1200.00;4537.30
28/10/2026;VIR EMETTEUR SOCIETE SALAIRE;3400.00;5737.30`;

  const sampleCsvDeferredCardFr = `Date;Carte;Operation;Debit;Credit
09/11/2026;4974;FNAC SPECTACLES BILLETTERIE;78.00;
07/11/2026;4974;DECATHLON SPORT GEAR;45.90;
04/11/2026;4974;RESTAURANT LE BISTROT DU PORT;64.00;
02/11/2026;4974;MONOPRIX COURSES FRAICHES;52.30;`;

  const sampleCsvEn = `Date,Description,Amount,Balance
2026-11-12,WHOLESALE SUPERMARKET GROCERIES,-85.40,4164.60
2026-11-11,HIGHWAY FUEL TOTAL PETROL,-62.50,4250.00
2026-11-10,FIBER BROADBAND & MOBILE AUTOPAY,-60.00,4312.50
2026-11-08,DOWNTOWN MEDICAL PHARMACY,-24.80,4372.50
2026-11-05,POWER UTILITY ELECTRICITY,-140.00,4397.30
2026-11-01,MORTGAGE HOME LOAN AUTOPAY,-1200.00,4537.30
2026-10-28,PAYROLL DIRECT DEPOSIT TECH CORP,3400.00,5737.30`;

  const handleParse = (text: string) => {
    setRawCsvText(text);
    if (!text.trim()) {
      setParseResult(null);
      return;
    }
    const res = parseBankStatementCsv(text, activeRules, activeCategories, activeBudgets);
    setParseResult(res);
  };

  const processSelectedFile = (file: File) => {
    setFileError(null);

    const lowerName = file.name.toLowerCase();
    const unsupportedExtensions = ['.xlsx', '.xls', '.pdf', '.png', '.jpg', '.jpeg', '.zip', '.doc', '.docx'];
    if (unsupportedExtensions.some(ext => lowerName.endsWith(ext))) {
      setFileError(
        isFr
          ? `Format non pris en charge (${file.name}). Veuillez exporter votre relevé au format .csv, .tsv ou .txt.`
          : `Unsupported file format (${file.name}). Please export your bank statement as .csv, .tsv, or .txt.`
      );
      return;
    }

    if (file.size === 0) {
      setFileError(isFr ? 'Le fichier sélectionné est vide.' : 'The selected file is empty.');
      return;
    }

    const applyContent = (content: string) => {
      const cleaned = content.replace(/^\uFEFF/, '');
      setSelectedFileName(file.name);
      handleParse(cleaned);
    };

    const reader = new FileReader();
    reader.onload = evt => {
      const content = typeof evt.target?.result === 'string' ? evt.target.result : '';
      // Fallback for French/European bank CSVs encoded in ISO-8859-1 / Windows-1252
      if (content.includes('\uFFFD')) {
        const fallbackReader = new FileReader();
        fallbackReader.onload = fallbackEvt => {
          const fallbackContent = typeof fallbackEvt.target?.result === 'string' ? fallbackEvt.target.result : content;
          applyContent(fallbackContent);
        };
        fallbackReader.onerror = () => applyContent(content);
        fallbackReader.readAsText(file, 'windows-1252');
        return;
      }
      applyContent(content);
    };
    reader.onerror = () => {
      setFileError(
        isFr
          ? 'Impossible de lire ce fichier depuis votre appareil. Essayez de copier-coller le contenu.'
          : 'Could not read this file from your device. Try copying and pasting its text.'
      );
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input value so selecting the same file again still triggers onChange
    e.target.value = '';
    if (!file) return;
    processSelectedFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handleToggleRow = (rowId: string) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const handleToggleAllNew = () => {
    if (!parseResult) return;
    const nonDuplicateRows = parseResult.parsedRecords.filter(
      r => !duplicateMap.get(r.id)?.isDuplicate
    );
    const targetPool = nonDuplicateRows.length > 0 ? nonDuplicateRows : parseResult.parsedRecords;
    const allSelected = targetPool.every(r => selectedRowIds.has(r.id));
    if (allSelected) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(targetPool.map(r => r.id)));
    }
  };

  const handleCommitImport = () => {
    if (!parseResult || parseResult.parsedRecords.length === 0) return;
    const recordsToImport = parseResult.parsedRecords.filter(r => selectedRowIds.has(r.id));
    if (recordsToImport.length === 0) return;
    importCsvTransactions(recordsToImport, selectedAccountId, { skipDuplicates: false });
    setParseResult(null);
    setSelectedRowIds(new Set());
    setRawCsvText('');
    setSelectedFileName(null);
    setFileError(null);
    navigateTo('TRANSACTIONS');
  };

  const openBankingTx = transactions.filter(t => !t.isDeleted && t.source === 'OPEN_BANKING');
  const connectedBankAccounts = openBankingConfig.isConnected
    ? openBankingConfig.discoveredAccounts || []
    : [];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {isFr ? 'Import & Synchronisation Bancaire' : 'Bank Import & Sync'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isFr
              ? 'Import manuel CSV gratuit ou synchronisation directe automatique via l’option open-banking.io'
              : 'Free manual CSV import or automated live bank sync via open-banking.io'}
          </p>
        </div>

        <button
          onClick={() => navigateTo('RULES')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition shadow-sm dark:shadow-none"
        >
          <Sliders className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <span>{isFr ? 'Gérer les Règles' : 'Manage Rules'}</span>
        </button>
      </div>

      {/* Top Method Selector Tabs */}
      <div className="flex p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl gap-1">
        <button
          onClick={() => setActiveTab('CSV')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold transition ${
            activeTab === 'CSV'
              ? 'bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
          }`}
        >
          <Upload className="w-4 h-4" />
          <span>{isFr ? 'Import Fichier CSV (100% Gratuit / Sans Abonnement)' : 'Manual CSV File Import (100% Free)'}</span>
        </button>

        <button
          onClick={() => setActiveTab('OPEN_BANKING')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold transition relative ${
            activeTab === 'OPEN_BANKING'
              ? 'bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
          }`}
        >
          <Zap className={`w-4 h-4 ${activeTab === 'OPEN_BANKING' ? 'text-white dark:text-slate-950' : 'text-amber-500 dark:text-amber-400'}`} />
          <span>{isFr ? 'Synchronisation Directe (Option open-banking.io)' : 'Direct Bank Sync (open-banking.io Option)'}</span>
          <span
            className={`hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase border ${
              activeTab === 'OPEN_BANKING'
                ? 'bg-white/20 text-white border-white/30 dark:bg-slate-950/20 dark:text-slate-950 dark:border-slate-950/25'
                : 'bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
            }`}
          >
            {openBankingConfig.isConnected ? openBankingConfig.environment : openBankingConfig.status}
          </span>
        </button>
      </div>

      {/* TAB 1: MANUAL CSV STATEMENT IMPORT (FREE) */}
      {activeTab === 'CSV' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Target Account & Quick Presets */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm dark:shadow-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {isFr ? 'Compte de destination :' : 'Target Account:'}
                </span>
                <select
                  value={selectedAccountId}
                  onChange={e => setSelectedAccountId(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                >
                  {activeAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currentBalance.toLocaleString()} {currency})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Demo Statement Loaders */}
              {sessionMode === 'DEMO' && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 hidden sm:inline">
                    {isFr ? 'Exemples prêts à tester :' : 'Test presets:'}
                  </span>
                  <button
                    onClick={() => {
                      const sample = isFr ? sampleCsvCheckingFr : sampleCsvEn;
                      handleParse(sample);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-teal-700 dark:text-teal-300 text-[11px] font-semibold transition"
                  >
                    {isFr ? 'Relevé Compte Courant' : 'Checking Statement Sample'}
                  </button>
                  <button
                    onClick={() => {
                      const cardAcc = activeAccounts.find(a => a.type === 'DEFERRED_CARD');
                      if (cardAcc) setSelectedAccountId(cardAcc.id);
                      handleParse(sampleCsvDeferredCardFr);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-blue-700 dark:text-blue-300 text-[11px] font-semibold transition"
                  >
                    {isFr ? 'Relevé Carte Différé' : 'Deferred Card Sample'}
                  </button>
                </div>
              )}
            </div>

            {/* Dropzone & Text Area */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className={`cursor-pointer border-2 border-dashed rounded-2xl p-6 text-center transition flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950/50 ${
                  isDragging
                    ? 'border-teal-500 dark:border-teal-400 bg-teal-50 dark:bg-teal-500/10'
                    : 'border-slate-300 dark:border-slate-800 hover:border-teal-500/60'
                }`}
              >
                <Upload className="w-8 h-8 text-teal-600 dark:text-teal-400 mb-2" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-1">
                  {isFr ? 'Importer un fichier .csv ou .tsv' : 'Upload CSV / TSV File'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
                  {isFr
                    ? 'Glissez-déposez le fichier de votre banque ou parcourez'
                    : 'Drag & drop bank export statement here'}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  className="sr-only"
                  aria-label={isFr ? 'Choisir un fichier CSV' : 'Select CSV File'}
                />
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="cursor-pointer px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 text-xs font-bold shadow-sm dark:shadow-md transition active:scale-95"
                >
                  {isFr ? 'Choisir un fichier' : 'Select File'}
                </button>
                {selectedFileName && (
                  <div className="mt-3 flex items-center gap-1.5 text-[11px] text-teal-700 dark:text-teal-300 font-medium">
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate max-w-[220px]">{selectedFileName}</span>
                  </div>
                )}
                {fileError && (
                  <div className="mt-3 flex items-center gap-1.5 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{fileError}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    {isFr ? 'Ou collez le texte brut du relevé :' : 'Or paste raw statement text:'}
                  </span>
                  {rawCsvText && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFileName(null);
                        setFileError(null);
                        handleParse('');
                      }}
                      className="text-[10px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 transition"
                    >
                      {isFr ? 'Effacer' : 'Clear'}
                    </button>
                  )}
                </div>
                <textarea
                  value={rawCsvText}
                  onChange={e => {
                    setSelectedFileName(null);
                    setFileError(null);
                    handleParse(e.target.value);
                  }}
                  placeholder="Date;Libellé;Montant&#10;12/11/2026;CARREFOUR;-85.40"
                  rows={5}
                  className="w-full flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-teal-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Parse Results Preview Table */}
          {parseResult && (() => {
            const totalCount = parseResult.parsedRecords.length;
            const duplicateCount = parseResult.parsedRecords.filter(
              r => duplicateMap.get(r.id)?.isDuplicate
            ).length;
            const newCount = totalCount - duplicateCount;
            const selectedCount = parseResult.parsedRecords.filter(r =>
              selectedRowIds.has(r.id)
            ).length;
            const nonDuplicatePool = parseResult.parsedRecords.filter(
              r => !duplicateMap.get(r.id)?.isDuplicate
            );
            const togglePool = nonDuplicatePool.length > 0 ? nonDuplicatePool : parseResult.parsedRecords;
            const allPoolSelected =
              togglePool.length > 0 && togglePool.every(r => selectedRowIds.has(r.id));

            return (
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        totalCount === 0
                          ? 'bg-rose-50 dark:bg-rose-500/20 text-rose-600 dark:text-rose-300'
                          : newCount === 0
                          ? 'bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300'
                          : 'bg-teal-50 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300'
                      }`}
                    >
                      {totalCount === 0 ? (
                        <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                      ) : newCount === 0 ? (
                        <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                      )}
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-900 dark:text-white text-sm">
                        {isFr
                          ? `${totalCount} opération${totalCount > 1 ? 's' : ''} détectée${totalCount > 1 ? 's' : ''}`
                          : `${totalCount} transaction${totalCount > 1 ? 's' : ''} discovered`}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {(() => {
                          const autoCount = parseResult.parsedRecords.filter(
                            r => !duplicateMap.get(r.id)?.isDuplicate && r.matchedCategoryId > 0 && r.matchedBudgetId > 0
                          ).length;
                          const dupText =
                            duplicateCount > 0
                              ? isFr
                                ? ` · ${duplicateCount} doublon${duplicateCount > 1 ? 's' : ''} détecté${duplicateCount > 1 ? 's' : ''}`
                                : ` · ${duplicateCount} duplicate${duplicateCount > 1 ? 's' : ''} detected`
                              : '';
                          return isFr
                            ? `Séparateur : "${parseResult.delimiter}" · ${newCount} nouvelle${newCount > 1 ? 's' : ''}${dupText} · ${autoCount} catégorisée${autoCount > 1 ? 's' : ''}`
                            : `Delimiter: "${parseResult.delimiter}" · ${newCount} new${dupText} · ${autoCount} auto-categorized`;
                        })()}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleCommitImport}
                    disabled={selectedCount === 0}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:shadow-none text-white dark:text-slate-950 font-bold text-xs shadow-sm dark:shadow-lg shadow-teal-500/20 transition active:scale-95 whitespace-nowrap shrink-0"
                  >
                    <span>
                      {selectedCount === 0
                        ? isFr
                          ? 'Aucune nouvelle opération'
                          : 'Nothing New to Import'
                        : isFr
                        ? `Importer (${selectedCount})`
                        : `Commit Import (${selectedCount})`}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                {duplicateCount > 0 && (
                  <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 text-xs text-amber-900 dark:text-amber-200">
                    <Copy className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>
                      {isFr
                        ? `${duplicateCount} opération${duplicateCount > 1 ? 's' : ''} déjà présente${duplicateCount > 1 ? 's' : ''} sur ce compte ${duplicateCount > 1 ? 'ont été décochées' : 'a été décochée'} automatiquement. Cochez une ligne pour l’importer quand même (ex. 2 achats identiques le même jour).`
                        : `${duplicateCount} transaction${duplicateCount > 1 ? 's' : ''} already present in this account ${duplicateCount > 1 ? 'were' : 'was'} unchecked automatically. Check any row to import it anyway (e.g. two identical purchases on the same day).`}
                    </span>
                  </div>
                )}

                {totalCount === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                    {isFr
                      ? 'Aucune opération valide n’a pu être extraite. Vérifiez le format des colonnes (Date, Libellé, Montant ou Débit/Crédit).'
                      : 'No valid transactions could be parsed. Check your columns (Date, Description, Amount or Debit/Credit).'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                          <th className="py-2.5 px-2 w-8">
                            <input
                              type="checkbox"
                              checked={allPoolSelected}
                              onChange={handleToggleAllNew}
                              aria-label={isFr ? 'Tout sélectionner' : 'Select all'}
                              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 text-teal-600 dark:text-teal-500 focus:ring-teal-500 cursor-pointer"
                            />
                          </th>
                          <th className="py-2.5 px-3">{isFr ? 'Date' : 'Date'}</th>
                          <th className="py-2.5 px-3">{isFr ? 'Libellé' : 'Description'}</th>
                          <th className="py-2.5 px-3">
                            {isFr ? 'Catégorie & Sous-catégorie' : 'Category & Sub-category'}
                          </th>
                          <th className="py-2.5 px-3 text-right">{isFr ? 'Montant' : 'Amount'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-medium">
                        {parseResult.parsedRecords.map(rec => {
                          const isUnassigned = !rec.matchedCategoryId || !rec.matchedBudgetId;
                          const dupInfo = duplicateMap.get(rec.id);
                          const isDuplicate = Boolean(dupInfo?.isDuplicate);
                          const isSelected = selectedRowIds.has(rec.id);

                          return (
                            <tr
                              key={rec.id}
                              onClick={() => handleToggleRow(rec.id)}
                              className={`cursor-pointer transition ${
                                isDuplicate && !isSelected
                                  ? 'opacity-55 bg-slate-50/70 dark:bg-slate-950/30 hover:bg-slate-100/70 dark:hover:bg-slate-800/30'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                              }`}
                            >
                              <td className="py-3 px-2" onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleRow(rec.id)}
                                  aria-label={rec.cleanTitle}
                                  className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 text-teal-600 dark:text-teal-500 focus:ring-teal-500 cursor-pointer"
                                />
                              </td>
                              <td className="py-3 px-3 text-slate-600 dark:text-slate-300 font-mono tabular-nums whitespace-nowrap">
                                {rec.dateStr}
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-slate-900 dark:text-white">{rec.cleanTitle}</span>
                                  {isDuplicate && (
                                    <span
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                        isSelected
                                          ? 'bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-500/30'
                                          : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                                      }`}
                                    >
                                      <Copy className="w-2.5 h-2.5" />
                                      <span>
                                        {isSelected
                                          ? isFr
                                            ? 'Doublon potentiel · Inclus'
                                            : 'Possible duplicate · Included'
                                          : isFr
                                          ? 'Doublon'
                                          : 'Duplicate'}
                                      </span>
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] font-mono text-slate-500 truncate max-w-xs">
                                  {rec.originalLabel}
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                {isUnassigned ? (
                                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                    <span>
                                      {isFr
                                        ? 'À catégoriser après import'
                                        : 'Unassigned (assign after import)'}
                                    </span>
                                  </span>
                                ) : (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                                      <CategoryIcon
                                        name={rec.matchedCategoryIcon}
                                        className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0"
                                      />
                                      <span>{rec.matchedCategoryName}</span>
                                      <span className="text-slate-400 dark:text-slate-600">·</span>
                                      <span className="text-teal-700 dark:text-teal-300">{rec.matchedBudgetTitle}</span>
                                    </span>
                                    {rec.matchedRulePattern && (
                                      <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                        ⚡ {rec.matchedRulePattern}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td
                                className={`py-3 px-3 text-right font-bold font-mono tabular-nums whitespace-nowrap ${
                                  rec.amount < 0
                                    ? 'text-slate-900 dark:text-slate-100'
                                    : 'text-emerald-600 dark:text-emerald-400'
                                }`}
                              >
                                {rec.amount < 0 ? '' : '+'}
                                {rec.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 2: LIVE BANK SYNC (OPEN-BANKING.IO) */}
      {activeTab === 'OPEN_BANKING' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Informative Disclaimer Banner */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-500/30 shadow-sm dark:shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {isFr ? 'Synchronisation Automatique PSD2' : 'PSD2 Live Account Sync'}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-500/30">
                    {openBankingConfig.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
                  {isFr
                    ? 'Cette intégration est une option facultative via l’API open-banking.io. Si vous ne souhaitez pas souscrire ou payer ce service externe, l’import CSV gratuit reste disponible en permanence.'
                    : 'This integration is an optional enhancement via the open-banking.io API. If you prefer not to pay or subscribe to external PSD2 services, free offline CSV import is 100% supported.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsConfigModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition"
              >
                <Key className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>{isFr ? 'Configurer Clés API' : 'API Settings'}</span>
              </button>

              <button
                onClick={syncOpenBankingNow}
                disabled={!openBankingConfig.isConnected || openBankingConfig.status === 'SYNCING'}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-bold text-xs shadow-sm dark:shadow-lg shadow-teal-500/20 transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${openBankingConfig.status === 'SYNCING' ? 'animate-spin' : ''}`}
                />
                <span>{isFr ? 'Synchroniser Maintenant' : 'Sync All Accounts'}</span>
              </button>
            </div>
          </div>

          {/* Sync Status Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">{isFr ? 'Dernière synchronisation :' : 'Last Sync:'}</span>
              <span className="text-sm font-bold text-slate-900 dark:text-white mt-1 block">
                {openBankingConfig.lastSyncTimestamp
                  ? new Date(openBankingConfig.lastSyncTimestamp).toLocaleTimeString(isFr ? 'fr-FR' : 'en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })
                  : (isFr ? 'Pas encore synchronisé' : 'Not synced yet')}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">{isFr ? 'Opérations synchronisées :' : 'Synced Transactions:'}</span>
              <span className="text-sm font-bold text-teal-700 dark:text-teal-400 mt-1 block">
                {openBankingTx.length} {isFr ? 'opérations' : 'items'}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">{isFr ? 'Environnement :' : 'Environment:'}</span>
              <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mt-1 block">
                {!openBankingConfig.isConnected
                  ? isFr
                    ? 'Non configuré'
                    : 'Not configured'
                  : openBankingConfig.environment === 'SANDBOX'
                    ? '🧪 Sandbox Simulator'
                    : '⚡ Live Production'}
              </span>
            </div>
          </div>

          {/* Connected Remote Accounts Overview */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  {isFr ? 'Comptes Bancaires Connectés (open-banking.io)' : 'Connected Bank Feeds'}
                </h3>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                {openBankingConfig.isConnected
                  ? `${connectedBankAccounts.length} ${isFr ? 'comptes découverts' : 'accounts discovered'}`
                  : isFr
                    ? 'Non connecté'
                    : 'Not connected'}
              </span>
            </div>

            {!openBankingConfig.isConnected ? (
              <div className="py-8 px-4 text-center space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                  {isFr
                    ? 'Aucun service Open Banking connecté. Configurez vos identifiants API pour connecter votre service et afficher vos comptes bancaires.'
                    : 'No Open Banking service connected yet. Configure your credentials to connect your service and view your bank accounts.'}
                </p>
                <button
                  onClick={() => setIsConfigModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-bold text-xs shadow-sm transition cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>{isFr ? 'Configurer les identifiants' : 'Configure Credentials'}</span>
                </button>
              </div>
            ) : connectedBankAccounts.length === 0 ? (
              <div className="py-8 text-center text-slate-500 dark:text-slate-400 text-xs">
                {isFr
                  ? 'Service connecté, mais aucun compte bancaire n’a été retourné par le fournisseur.'
                  : 'Connected, but no bank accounts were returned by the connected service.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {connectedBankAccounts.map(rAcc => {
                  const mappedLocalId = openBankingConfig.accountMappings[rAcc.id];
                  const localAcc = accounts.find(a => a.id === mappedLocalId);

                  return (
                    <div
                      key={rAcc.id}
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">{rAcc.institution}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-500/20">
                            {rAcc.type}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-700 dark:text-slate-300 font-medium mt-1">{rAcc.name}</p>
                        <p className="text-[10px] font-mono text-slate-500 mt-0.5">{rAcc.iban}</p>
                      </div>

                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-end justify-between">
                        <div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                            {isFr ? 'Lié à :' : 'Mapped to:'}
                          </span>
                          <span className="text-xs font-bold text-teal-700 dark:text-teal-300">
                            {localAcc ? localAcc.name : (isFr ? 'Non associé' : 'Unmapped')}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">
                            {rAcc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Open Banking Transactions */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                {isFr ? 'Dernières Opérations Synchronisées via open-banking.io' : 'Recent Synced Transactions'}
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">{openBankingTx.length} {isFr ? 'opérations' : 'items'}</span>
            </div>

            {openBankingTx.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                {isFr
                  ? 'Aucune opération synchronisée pour l’instant. Cliquez sur "Synchroniser Maintenant" ci-dessus pour importer les flux bancaires.'
                  : 'No synced transactions yet. Click "Sync All Accounts" above to fetch bank feeds.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                      <th className="py-2 px-3">{isFr ? 'Date' : 'Date'}</th>
                      <th className="py-2 px-3">{isFr ? 'Libellé' : 'Description'}</th>
                      <th className="py-2 px-3">
                        {isFr ? 'Catégorie & Sous-catégorie' : 'Category & Sub-category'}
                      </th>
                      <th className="py-2 px-3">{isFr ? 'Statut' : 'Status'}</th>
                      <th className="py-2 px-3 text-right">{isFr ? 'Montant' : 'Amount'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-medium">
                    {openBankingTx.slice(0, 8).map(tx => {
                      const isUnassigned = !tx.categoryId || !tx.budgetId;
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition">
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 font-mono tabular-nums whitespace-nowrap">
                            {new Date(tx.date).toLocaleDateString(isFr ? 'fr-FR' : 'en-US')}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-slate-900 dark:text-white block">{tx.title}</span>
                            <span className="text-[10px] font-mono text-slate-500">{tx.originalBankLabel}</span>
                          </td>
                          <td className="py-2.5 px-3">
                            {isUnassigned ? (
                              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                {isFr ? 'À catégoriser' : 'Unassigned'}
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                                {tx.categoryName}
                                {tx.budgetTitle && (
                                  <>
                                    <span className="text-slate-400 dark:text-slate-600 mx-1">·</span>
                                    <span className="text-teal-700 dark:text-teal-300">{tx.budgetTitle}</span>
                                  </>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-[10px] font-bold text-teal-700 dark:text-teal-300 uppercase tracking-wider">
                              {tx.status}
                            </span>
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-bold font-mono tabular-nums whitespace-nowrap ${
                              tx.amount < 0
                                ? 'text-slate-900 dark:text-slate-100'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {tx.amount < 0 ? '' : '+'}
                            {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Open Banking Configuration Modal */}
      <OpenBankingConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
      />
    </div>
  );
};
