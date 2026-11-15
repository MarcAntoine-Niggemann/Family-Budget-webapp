import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let cachedDeferredPrompt: BeforeInstallPromptEvent | null = null;
let cachedIsInstalled = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach(listener => listener());
}

function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function checkIsIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isClassicIOS = /iphone|ipad|ipod/.test(ua);
  const isIPadOS =
    window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
  return isClassicIOS || isIPadOS;
}

if (typeof window !== 'undefined') {
  cachedIsInstalled = checkIsStandalone();

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    cachedDeferredPrompt = e as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    cachedIsInstalled = true;
    cachedDeferredPrompt = null;
    notifyListeners();
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    cachedDeferredPrompt
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(
    cachedIsInstalled || checkIsStandalone()
  );
  const [isIOS] = useState<boolean>(checkIsIOS);

  useEffect(() => {
    const syncState = () => {
      setDeferredPrompt(cachedDeferredPrompt);
      setIsInstalled(cachedIsInstalled || checkIsStandalone());
    };

    listeners.add(syncState);
    syncState();

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        cachedIsInstalled = true;
        cachedDeferredPrompt = null;
      }
      syncState();
    };

    mediaQuery.addEventListener('change', handleDisplayModeChange);

    return () => {
      listeners.delete(syncState);
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    const promptEvent = cachedDeferredPrompt || deferredPrompt;
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      cachedIsInstalled = true;
      cachedDeferredPrompt = null;
      notifyListeners();
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install
  };
}
