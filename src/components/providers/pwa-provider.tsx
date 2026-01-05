"use client";

/**
 * 🔧 PWA Provider
 * 
 * Gestisce:
 * - Registrazione Service Worker
 * - Push notification permissions
 * - Install prompt
 * - Offline detection
 */

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAContextType {
  isInstalled: boolean;
  isOnline: boolean;
  canInstall: boolean;
  isNotificationSupported: boolean;
  notificationPermission: NotificationPermission | 'default';
  installApp: () => Promise<boolean>;
  requestNotificationPermission: () => Promise<boolean>;
  subscribeToPush: () => Promise<PushSubscription | null>;
}

const PWAContext = createContext<PWAContextType | null>(null);

export function PWAProvider({ children }: { children: ReactNode }) {
  // Inizializza isInstalled in base al display-mode
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches;
  });
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof window === 'undefined') return true;
    return navigator.onLine;
  });
  const [canInstall, setCanInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if (typeof window === 'undefined') return 'default';
    return 'Notification' in window ? Notification.permission : 'default';
  });
  const [isNotificationSupported] = useState(() => {
    if (typeof window === 'undefined') return false;
    return 'Notification' in window && 'serviceWorker' in navigator;
  });

  // Registra Service Worker
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Online/offline detection
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Install prompt event
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setCanInstall(true);
      console.log('📲 PWA: Install prompt disponibile');
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // App installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      setDeferredPrompt(null);
      console.log('✅ PWA: App installata');
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    // Register Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('✅ Service Worker registrato:', registration.scope);

          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('🔄 Nuovo Service Worker disponibile');
                  // In futuro: mostra toast per refresh
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('❌ Service Worker registration failed:', error);
        });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Install app
  const installApp = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) {
      console.warn('PWA: No install prompt available');
      return false;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('✅ PWA: User accepted install');
        setCanInstall(false);
        setDeferredPrompt(null);
        return true;
      } else {
        console.log('❌ PWA: User dismissed install');
        return false;
      }
    } catch (error) {
      console.error('PWA: Install error:', error);
      return false;
    }
  }, [deferredPrompt]);

  // Request notification permission
  const requestNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      console.warn('PWA: Notifications not supported');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      return permission === 'granted';
    } catch (error) {
      console.error('PWA: Notification permission error:', error);
      return false;
    }
  }, []);

  // Subscribe to push notifications
  const subscribeToPush = useCallback(async (): Promise<PushSubscription | null> => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('PWA: Push not supported');
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Check existing subscription
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        // Create new subscription
        // In produzione: VAPID key dal server
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        
        if (!vapidPublicKey) {
          console.warn('PWA: VAPID key not configured');
          return null;
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
        });

        // In produzione: invia subscription al server
        console.log('✅ PWA: Push subscription created');
      }

      return subscription;
    } catch (error) {
      console.error('PWA: Push subscription error:', error);
      return null;
    }
  }, []);

  const value: PWAContextType = {
    isInstalled,
    isOnline,
    canInstall,
    isNotificationSupported,
    notificationPermission,
    installApp,
    requestNotificationPermission,
    subscribeToPush,
  };

  return (
    <PWAContext.Provider value={value}>
      {children}
    </PWAContext.Provider>
  );
}

// Hook per usare il context
export function usePWA(): PWAContextType {
  const context = useContext(PWAContext);
  if (!context) {
    throw new Error('usePWA must be used within PWAProvider');
  }
  return context;
}

// Utility per convertire VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray as Uint8Array<ArrayBuffer>;
}
