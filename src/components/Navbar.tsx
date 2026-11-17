import {
  LayoutDashboard,
  Receipt,
  CalendarDays,
  BarChart3,
  Upload,
  GitCompare,
  TrendingUp,
  Sliders,
  CloudCheck,
  CloudSync,
  CloudOff,
  Plus,
  Globe,
  Wallet,
  Shield,
  QrCode,
  LogOut,
  Lock
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { AppScreen } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

export const Navbar: React.FC<{ onOpenAddTx: () => void; onOpenShareQr?: () => void }> = ({
  onOpenAddTx,
  onOpenShareQr
}) => {
  const {
    sessionMode,
    currentScreen,
    navigateTo,
    accounts,
    activeAccountId,
    setActiveAccountId,
    language,
    setLanguage,
    currency,
    config,
    syncState,
    syncWithFirebaseNow,
    firebaseUser,
    lockVault,
    logout
  } = useBudget();

  const isFr = language === 'fr';

  const navItems: { screen: AppScreen; label: string; icon: React.ReactNode }[] = [
    {
      screen: 'DASHBOARD',
      label: isFr ? 'Tableau de bord' : 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />
    },
    {
      screen: 'TRANSACTIONS',
      label: isFr ? 'Opérations' : 'Transactions',
      icon: <Receipt className="w-4 h-4" />
    },
    {
      screen: 'BUDGET_PLANNER',
      label: isFr ? 'Budget' : 'Budgets',
      icon: <CalendarDays className="w-4 h-4" />
    },
    {
      screen: 'REPORTS',
      label: isFr ? 'Rapports' : 'Reports',
      icon: <BarChart3 className="w-4 h-4" />
    },
    {
      screen: 'CUSTOM_FORECAST',
      label: isFr ? 'Prévisionnel' : 'Cash Flow',
      icon: <TrendingUp className="w-4 h-4" />
    },
    {
      screen: 'CSV_IMPORT',
      label: isFr ? 'Import Relevé' : 'Bank Import',
      icon: <Upload className="w-4 h-4" />
    },
    {
      screen: 'RECONCILIATION',
      label: isFr ? 'Rapprochement' : 'Reconciliation',
      icon: <GitCompare className="w-4 h-4" />
    },
    {
      screen: 'RULES',
      label: isFr ? 'Règles' : 'Rules',
      icon: <Sliders className="w-4 h-4" />
    }
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center shrink-0 min-w-0">
            <button
              onClick={() => navigateTo('DASHBOARD')}
              aria-label="Budget Family"
              title="Budget Family"
              className="flex items-center gap-2.5 text-left group transition cursor-pointer"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-teal-600 dark:bg-teal-500 flex items-center justify-center text-white dark:text-slate-950 shrink-0 shadow-sm">
                <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-white dark:text-slate-950" />
              </div>
              <div className="hidden sm:flex items-baseline gap-2 min-w-0">
                <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-300 transition whitespace-nowrap">
                  Budget Family
                </span>
                <span className="hidden xl:inline text-xs text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                  · {config.familyName || (sessionMode === 'DEMO' ? 'Demo' : 'Vault')}
                </span>
              </div>
            </button>
          </div>

          {/* Account Filter dropdown */}
          <div className="hidden lg:flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-300">
              <Wallet className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <select
                aria-label="Filter by account"
                value={activeAccountId || 'ALL'}
                onChange={e => setActiveAccountId(e.target.value === 'ALL' ? null : e.target.value)}
                className="bg-transparent text-slate-800 dark:text-slate-200 font-medium focus:outline-none cursor-pointer max-w-[180px] xl:max-w-[220px] truncate"
              >
                <option value="ALL" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-200">
                  {isFr ? 'Tous les comptes' : 'All Accounts'}
                </option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id} className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-200">
                    {acc.name} ({acc.currentBalance.toLocaleString()} {acc.currency || currency})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions & Utilities */}
          <div className="flex items-center gap-1 sm:gap-2 min-w-0 overflow-x-auto scrollbar-none">
            {/* Sync Status Button */}
            {sessionMode === 'FIRESTORE' && (
              <button
                onClick={() => syncWithFirebaseNow()}
                title={syncState.lastSyncMessage || 'Sync with Firestore'}
                className="p-1.5 sm:p-2 rounded-lg bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/50 text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 transition shrink-0 cursor-pointer"
              >
                {syncState.lastSyncStatus === 'SYNCING' ? (
                  <CloudSync className="w-4 h-4 animate-spin text-teal-600 dark:text-teal-400" />
                ) : syncState.lastSyncStatus === 'ERROR' ? (
                  <CloudOff className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                ) : !firebaseUser ? (
                  <CloudOff className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                ) : (
                  <CloudCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                )}
              </button>
            )}

            {/* PWA Install Button */}
            <PWAInstallButton variant="navbar" />

            {/* Language Switcher */}
            <button
              onClick={() => setLanguage(isFr ? 'en' : 'fr')}
              className="flex items-center gap-1 px-2 py-1.5 sm:px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/50 text-xs font-semibold text-slate-700 dark:text-slate-300 transition whitespace-nowrap shrink-0 cursor-pointer"
              title="Change Language"
            >
              <Globe className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>{language.toUpperCase()}</span>
            </button>

            {/* Share Vault QR Code (BYOB Firestore only) */}
            {onOpenShareQr && sessionMode === 'FIRESTORE' && config.projectId && (
              <button
                onClick={onOpenShareQr}
                className="p-1.5 sm:p-2 rounded-lg bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/50 text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 transition shrink-0 cursor-pointer"
                title={isFr ? 'Partager le QR Code du Coffre' : 'Share Vault via QR Code'}
              >
                <QrCode className="w-4 h-4" />
              </button>
            )}

            {/* Vault Settings / Profile */}
            <button
              onClick={() => navigateTo('FIRESTORE_CONFIG')}
              className={`p-1 sm:p-1.5 rounded-lg border text-xs font-medium transition shrink-0 cursor-pointer ${
                currentScreen === 'FIRESTORE_CONFIG'
                  ? 'bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-500/20 dark:border-teal-500/50 dark:text-teal-300'
                  : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-800 dark:border-slate-700/50 dark:text-slate-300'
              }`}
              title={isFr ? 'Paramètres du Coffre' : 'Vault Settings'}
            >
              <div className="w-5 h-5 rounded-full bg-teal-600 text-white dark:bg-teal-600/40 dark:text-teal-200 flex items-center justify-center font-bold text-[10px] overflow-hidden">
                {firebaseUser?.photoURL ? (
                  <img src={firebaseUser.photoURL} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                ) : (
                  config.currentUserName ? config.currentUserName.charAt(0) : 'A'
                )}
              </div>
            </button>

            {/* Quick Add Expense Button */}
            <button
              onClick={onOpenAddTx}
              className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 rounded-lg bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-semibold text-xs transition whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{isFr ? 'Ajouter' : 'New Entry'}</span>
            </button>

            {/* Lock Vault (keeps encrypted cache, drops RAM key) */}
            {sessionMode === 'FIRESTORE' && (
              <button
                onClick={() => lockVault()}
                className="flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-300 text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer"
                title={isFr ? 'Verrouiller le coffre (conserve le cache chiffré)' : 'Lock Vault (keep encrypted cache)'}
              >
                <Lock className="w-4 h-4" />
                <span className="hidden xl:inline">{isFr ? 'Verrouiller' : 'Lock'}</span>
              </button>
            )}

            {/* Logout Button (erases financial data & Open Banking config, preserves encrypted BYOB config) */}
            <button
              onClick={() => logout()}
              className="flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 dark:bg-slate-800/60 dark:hover:bg-rose-500/15 border border-slate-200 dark:border-slate-700/50 hover:border-rose-300 dark:hover:border-rose-500/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-300 text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer"
              title={
                isFr
                  ? 'Déconnexion (efface les données financières et clés Open Banking)'
                  : 'Log Out (erase financial data & Open Banking keys)'
              }
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden lg:inline">{isFr ? 'Déconnexion' : 'Log Out'}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <nav className="flex items-center space-x-1 overflow-x-auto py-1 scrollbar-none border-t border-slate-200 dark:border-slate-800/60">
          {navItems.map(item => {
            const isActive = currentScreen === item.screen;
            return (
              <button
                key={item.screen}
                onClick={() => navigateTo(item.screen)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition cursor-pointer ${
                  isActive
                    ? 'bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
