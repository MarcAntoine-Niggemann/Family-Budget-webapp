import React, { useState, useEffect } from 'react';
import { BudgetProvider, useBudget } from './context/BudgetContext';
import { Navbar } from './components/Navbar';
import { DashboardScreen } from './screens/DashboardScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { BudgetPlannerScreen } from './screens/BudgetPlannerScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { CustomForecastScreen } from './screens/CustomForecastScreen';
import { CsvImportScreen } from './screens/CsvImportScreen';
import { ReconciliationScreen } from './screens/ReconciliationScreen';
import { RulesScreen } from './screens/RulesScreen';
import { FirebaseSyncScreen } from './screens/FirebaseSyncScreen';
import { LoginScreen } from './screens/LoginScreen';
import { AddTransactionModal } from './components/AddTransactionModal';
import { EditTransactionModal } from './components/EditTransactionModal';
import { SplitTransactionModal } from './components/SplitTransactionModal';
import { TransferModal } from './components/TransferModal';
import { ShareVaultQrModal } from './components/ShareVaultQrModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { TransactionEntity } from './types';
import { Check, X } from 'lucide-react';

const AppContent: React.FC = () => {
  const {
    sessionMode,
    currentScreen,
    toastMessage,
    dismissToast
  } = useBudget();

  // Modal controls
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isShareQrOpen, setIsShareQrOpen] = useState(false);
  const [selectedTxForEdit, setSelectedTxForEdit] = useState<TransactionEntity | null>(null);
  const [selectedTxForSplit, setSelectedTxForSplit] = useState<TransactionEntity | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        dismissToast();
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage, dismissToast]);

  const toastNode = toastMessage ? (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900 border border-teal-500/40 text-slate-100 shadow-2xl text-xs font-semibold">
      <div className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
        <Check className="w-3.5 h-3.5" />
      </div>
      <span>{toastMessage}</span>
      <button
        onClick={dismissToast}
        className="text-slate-400 hover:text-slate-200 transition ml-2 cursor-pointer"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  ) : null;

  // Hard gate: display ONLY LoginScreen before user chooses Demo Mode or connects Firestore
  if (!sessionMode) {
    return (
      <>
        <LoginScreen />
        <OfflineIndicator />
        {toastNode}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar
        onOpenAddTx={() => setIsAddTxOpen(true)}
        onOpenShareQr={() => setIsShareQrOpen(true)}
      />

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {currentScreen === 'DASHBOARD' && (
          <DashboardScreen
            onOpenAddTx={() => setIsAddTxOpen(true)}
            onOpenTransfer={() => setIsTransferOpen(true)}
            onSelectTransaction={tx => setSelectedTxForEdit(tx)}
          />
        )}

        {currentScreen === 'TRANSACTIONS' && (
          <TransactionsScreen
            onOpenAddTx={() => setIsAddTxOpen(true)}
            onSelectTransaction={tx => setSelectedTxForEdit(tx)}
            onOpenSplit={tx => setSelectedTxForSplit(tx)}
          />
        )}

        {currentScreen === 'BUDGET_PLANNER' && <BudgetPlannerScreen />}

        {currentScreen === 'REPORTS' && <ReportsScreen />}

        {currentScreen === 'CUSTOM_FORECAST' && <CustomForecastScreen />}

        {currentScreen === 'CSV_IMPORT' && <CsvImportScreen />}

        {currentScreen === 'RECONCILIATION' && <ReconciliationScreen />}

        {currentScreen === 'RULES' && <RulesScreen />}

        {currentScreen === 'FIRESTORE_CONFIG' && <FirebaseSyncScreen />}
      </main>

      {/* Modals */}
      <AddTransactionModal
        isOpen={isAddTxOpen}
        onClose={() => setIsAddTxOpen(false)}
      />

      <EditTransactionModal
        isOpen={selectedTxForEdit !== null}
        transaction={selectedTxForEdit}
        onClose={() => setSelectedTxForEdit(null)}
        onOpenSplit={tx => setSelectedTxForSplit(tx)}
      />

      <SplitTransactionModal
        isOpen={selectedTxForSplit !== null}
        transaction={selectedTxForSplit}
        onClose={() => setSelectedTxForSplit(null)}
      />

      <TransferModal
        isOpen={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
      />

      <ShareVaultQrModal
        isOpen={isShareQrOpen}
        onClose={() => setIsShareQrOpen(false)}
      />

      <OfflineIndicator />
      {toastNode}
    </div>
  );
};

export function App() {
  return (
    <BudgetProvider>
      <AppContent />
    </BudgetProvider>
  );
}

export default App;
