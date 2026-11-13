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
  LogOut
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { AppScreen } from '../types';

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
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigateTo('DASHBOARD')}
              className="flex items-center gap-2.5 text-left group transition cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-teal-500 flex items-center justify-center text-slate-950 shrink-0">
                <Shield className="w-5 h-5 text-slate-950" />
              </div>
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="font-bold text-lg tracking-tight text-white group-hover:text-teal-300 transition whitespace-nowrap">
                  Budget Family
                </span>
                <span className="hidden sm:inline text-xs text-slate-400 truncate max-w-[180px]">
                  · {config.familyName || (sessionMode === 'DEMO' ? 'Demo' : 'Vault')}
                </span>
              </div>
            </button>
          </div>

          {/* Account Filter dropdown */}
          <div className="hidden md:flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300">
              <Wallet className="w-3.5 h-3.5 text-teal-400" />
              <select
                aria-label="Filter by account"
                value={activeAccountId || 'ALL'}
                onChange={e => setActiveAccountId(e.target.value === 'ALL' ? null : e.target.value)}
                className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-slate-800 text-slate-200">
                  {isFr ? 'Tous les comptes' : 'All Accounts'}
                </option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id} className="bg-slate-800 text-slate-200">
                    {acc.name} ({acc.currentBalance.toLocaleString()} {acc.currency || currency})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions & Utilities */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Sync Status Button */}
            {sessionMode === 'FIRESTORE' && (
              <button
                onClick={() => syncWithFirebaseNow()}
                title={syncState.lastSyncMessage || 'Sync with Firestore'}
                className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 text-slate-300 hover:text-teal-400 transition cursor-pointer"
              >
                {syncState.lastSyncStatus === 'SYNCING' ? (
                  <CloudSync className="w-4 h-4 animate-spin text-teal-400" />
                ) : syncState.lastSyncStatus === 'ERROR' ? (
                  <CloudOff className="w-4 h-4 text-rose-400" />
                ) : !firebaseUser ? (
                  <CloudOff className="w-4 h-4 text-amber-400" />
                ) : (
                  <CloudCheck className="w-4 h-4 text-emerald-400" />
                )}
              </button>
            )}

            {/* Language Switcher */}
            <button
              onClick={() => setLanguage(isFr ? 'en' : 'fr')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 text-xs font-semibold text-slate-300 transition whitespace-nowrap cursor-pointer"
              title="Change Language"
            >
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <span>{language.toUpperCase()}</span>
            </button>

            {/* Share Vault QR Code (BYOB Firestore only) */}
            {onOpenShareQr && sessionMode === 'FIRESTORE' && config.projectId && (
              <button
                onClick={onOpenShareQr}
                className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 text-slate-300 hover:text-teal-400 transition cursor-pointer"
                title={isFr ? 'Partager le QR Code du Coffre' : 'Share Vault via QR Code'}
              >
                <QrCode className="w-4 h-4" />
              </button>
            )}

            {/* Vault Settings / Profile */}
            <button
              onClick={() => navigateTo('FIRESTORE_CONFIG')}
              className={`p-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
                currentScreen === 'FIRESTORE_CONFIG'
                  ? 'bg-teal-500/20 border-teal-500/50 text-teal-300'
                  : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/50 text-slate-300'
              }`}
              title={isFr ? 'Paramètres du Coffre' : 'Vault Settings'}
            >
              <div className="w-5 h-5 rounded-full bg-teal-600/40 text-teal-200 flex items-center justify-center font-bold text-[10px] overflow-hidden">
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-xs transition whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{isFr ? 'Ajouter' : 'New Entry'}</span>
            </button>

            {/* Logout Button (erases all local data except BYOB config) */}
            <button
              onClick={() => logout()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-rose-500/15 border border-slate-700/50 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 text-xs font-semibold transition whitespace-nowrap cursor-pointer"
              title={isFr ? 'Déconnexion (efface les données locales)' : 'Log Out (erase local data)'}
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden lg:inline">{isFr ? 'Déconnexion' : 'Log Out'}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <nav className="flex items-center space-x-1 overflow-x-auto py-1 scrollbar-none border-t border-slate-800/60">
          {navItems.map(item => {
            const isActive = currentScreen === item.screen;
            return (
              <button
                key={item.screen}
                onClick={() => navigateTo(item.screen)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition cursor-pointer ${
                  isActive
                    ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
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
