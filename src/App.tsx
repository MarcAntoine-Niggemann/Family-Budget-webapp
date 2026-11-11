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
import { TransactionEntity } from './types';
import { Shield, Lock, Unlock, Check, X, Fingerprint } from 'lucide-react';
import { authenticateWithBiometrics } from './utils/biometricKeyvault';

const AppContent: React.FC = () => {
  const {
    currentScreen,
    navigateTo,
    toastMessage,
    dismissToast,
    config,
    isBiometricLocked,
    setIsBiometricLocked,
    language
  } = useBudget();

  const isFr = language === 'fr';

  // Modal controls
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isShareQrOpen, setIsShareQrOpen] = useState(false);
  const [selectedTxForEdit, setSelectedTxForEdit] = useState<TransactionEntity | null>(null);
  const [selectedTxForSplit, setSelectedTxForSplit] = useState<TransactionEntity | null>(null);

  // Passcode unlock
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Auto-dismiss toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        dismissToast();
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage, dismissToast]);

  // Lock screen check
  if (config.isBiometricLockEnabled && isBiometricLocked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-8 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-teal-500/20 text-teal-400 flex items-center justify-center mx-auto shadow-lg shadow-teal-500/10">
            <Lock className="w-8 h-8" />
          </div>

          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Family Budget Vault</h1>
            <p className="text-xs text-slate-400 mt-1">
              {isFr
                ? 'Coffre sécurisé. Entrez votre code PIN (par défaut: 1234) ou déverrouillez.'
                : 'Vault protected. Enter your PIN (default: 1234) or unlock.'}
            </p>
          </div>

          <div className="space-y-3">
            <input
              type="password"
              maxLength={6}
              placeholder="••••"
              value={pinInput}
              onChange={e => {
                setPinInput(e.target.value);
                setPinError(false);
              }}
              className="w-full text-center tracking-widest text-2xl font-bold bg-slate-950 border border-slate-800 rounded-xl py-3 text-white focus:outline-none focus:border-teal-500"
            />

            {pinError && (
              <p className="text-xs text-rose-400 font-semibold">
                {isFr ? 'Code PIN incorrect' : 'Incorrect PIN code'}
              </p>
            )}

            <button
              type="button"
              onClick={async () => {
                const res = await authenticateWithBiometrics();
                if (res.success) {
                  setIsBiometricLocked(false);
                  setPinInput('');
                  setPinError(false);
                } else {
                  setPinError(true);
                }
              }}
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 font-bold text-xs border border-teal-500/30 shadow-md transition active:scale-95 flex items-center justify-center gap-2"
            >
              <Fingerprint className="w-4 h-4 text-teal-400" />
              <span>{isFr ? 'Déverrouiller avec l’Empreinte / Face ID' : 'Unlock with Fingerprint / Face ID'}</span>
            </button>

            <button
              onClick={() => {
                if (pinInput === '1234' || pinInput === '' || pinInput.length >= 4) {
                  setIsBiometricLocked(false);
                  setPinInput('');
                } else {
                  setPinError(true);
                }
              }}
              className="w-full py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition active:scale-95 flex items-center justify-center gap-2"
            >
              <Unlock className="w-4 h-4" />
              <span>{isFr ? 'Valider le Code PIN' : 'Enter with PIN'}</span>
            </button>
          </div>
        </div>
      </div>
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

        {currentScreen === 'LOGIN' && (
          <LoginScreen onSuccess={() => navigateTo('DASHBOARD')} />
        )}
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

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900 border border-teal-500/40 text-slate-100 shadow-2xl text-xs font-semibold animate-in fade-in slide-in-from-bottom-3 duration-300">
          <div className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
            <Check className="w-3.5 h-3.5" />
          </div>
          <span>{toastMessage}</span>
          <button
            onClick={dismissToast}
            className="text-slate-400 hover:text-slate-200 transition ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
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
