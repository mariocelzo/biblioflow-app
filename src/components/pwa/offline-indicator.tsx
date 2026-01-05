"use client";

/**
 * 📡 Offline Indicator
 * 
 * Mostra un banner quando l'app è offline
 */

import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWA } from '@/components/providers/pwa-provider';

export function OfflineIndicator() {
  const { isOnline } = usePWA();

  if (isOnline) {
    return null;
  }

  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 dark:bg-amber-600 text-white px-4 py-2">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WifiOff className="h-4 w-4" />
          <span className="text-sm font-medium">
            Sei offline. Alcune funzioni potrebbero non essere disponibili.
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-white hover:bg-white/20"
          onClick={handleRetry}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Riprova
        </Button>
      </div>
    </div>
  );
}
