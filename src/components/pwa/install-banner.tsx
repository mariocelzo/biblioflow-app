"use client";

/**
 * 📲 PWA Install Banner
 * 
 * Mostra un banner per installare l'app come PWA
 */

import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWA } from '@/components/providers/pwa-provider';

export function InstallBanner() {
  const { canInstall, installApp, isInstalled } = usePWA();
  const [isDismissed, setIsDismissed] = useState(false);

  // Non mostrare se già installata, non può essere installata, o è stata chiusa
  if (isInstalled || !canInstall || isDismissed) {
    return null;
  }

  const handleInstall = async () => {
    const success = await installApp();
    if (!success) {
      console.log('Installazione annullata dall\'utente');
    }
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 text-white rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-white/20 rounded-lg">
            <Download className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">Installa BiblioFlow</h3>
            <p className="text-xs text-blue-100 mt-1">
              Aggiungi l&apos;app alla home per un accesso rapido, anche offline!
            </p>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="secondary"
                className="bg-white text-blue-700 hover:bg-blue-50"
                onClick={handleInstall}
              >
                Installa
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20"
                onClick={() => setIsDismissed(true)}
              >
                Non ora
              </Button>
            </div>
          </div>
          <button
            onClick={() => setIsDismissed(true)}
            className="p-1 hover:bg-white/20 rounded"
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
