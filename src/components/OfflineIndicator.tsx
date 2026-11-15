import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useBudget } from '../context/BudgetContext';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { language } = useBudget();

  if (isOnline) return null;

  const isFr = language === 'fr';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500/95 border border-amber-400/50 px-3.5 py-2 text-xs font-semibold text-slate-950 shadow-xl backdrop-blur-sm"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>
        {isFr
          ? 'Mode hors ligne — Données en cache actives'
          : 'Offline Mode — Using cached vault data'}
      </span>
    </div>
  );
};
