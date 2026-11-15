import React, { useState } from 'react';
import { Download, Share, PlusSquare, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useBudget } from '../context/BudgetContext';

interface PWAInstallButtonProps {
  variant?: 'navbar' | 'login';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'navbar' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { language } = useBudget();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const isFr = language === 'fr';

  // Hide when already running as an installed standalone PWA
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop install flow
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => install()}
        title={isFr ? 'Installer l’application sur cet appareil' : 'Install app on this device'}
        className={
          variant === 'login'
            ? 'flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/40 text-xs font-semibold text-teal-300 transition whitespace-nowrap shrink-0 cursor-pointer'
            : 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/40 text-xs font-semibold text-teal-300 transition whitespace-nowrap cursor-pointer'
        }
      >
        <Download className="w-3.5 h-3.5" />
        <span className={variant === 'navbar' ? 'hidden sm:inline' : ''}>
          {isFr ? 'Installer' : 'Install App'}
        </span>
      </button>
    );
  }

  // iOS Safari guided installation flow
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          title={isFr ? 'Installer sur iPhone / iPad' : 'Install on iPhone / iPad'}
          className={
            variant === 'login'
              ? 'flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-teal-300 transition whitespace-nowrap shrink-0 cursor-pointer'
              : 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 text-xs font-semibold text-teal-300 transition whitespace-nowrap cursor-pointer'
          }
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span className={variant === 'navbar' ? 'hidden sm:inline' : ''}>
            {isFr ? 'Installer iOS' : 'Install iOS'}
          </span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-white">
                    {isFr ? 'Installer sur iPhone / iPad' : 'Install on iPhone / iPad'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <Share className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                  <p>
                    {isFr ? (
                      <>
                        1. Appuyez sur le bouton <strong className="text-white">Partager</strong> dans la barre d’outils Safari.
                      </>
                    ) : (
                      <>
                        1. Tap the <strong className="text-white">Share</strong> button in the Safari toolbar.
                      </>
                    )}
                  </p>
                </div>

                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <PlusSquare className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                  <p>
                    {isFr ? (
                      <>
                        2. Faites défiler et choisissez <strong className="text-white">Sur l’écran d’accueil</strong>, puis confirmez.
                      </>
                    ) : (
                      <>
                        2. Scroll down and tap <strong className="text-white">Add to Home Screen</strong>, then confirm.
                      </>
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition cursor-pointer"
              >
                {isFr ? 'Compris' : 'Got it'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
