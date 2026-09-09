"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

interface AccessibilitySettings {
  enabled: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  largeText: boolean;
  screenReader: boolean;
  keyboardNavigation: boolean;
  darkMode: boolean;
  fontSize: number; // 16-24px
}

interface AccessibilityContextType {
  settings: AccessibilitySettings;
  updateSettings: (settings: Partial<AccessibilitySettings>) => void;
  toggleAccessibility: (enabled: boolean) => void;
}

const defaultSettings: AccessibilitySettings = {
  enabled: false,
  highContrast: false,
  reducedMotion: false,
  largeText: false,
  screenReader: false,
  keyboardNavigation: true,
  darkMode: false,
  fontSize: 16,
};

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

// Numero massimo di tentativi automatici di ricaricare le preferenze da
// /api/profilo prima di rinunciare e lasciare che sia l'utente (ricaricando
// la pagina) a riprovare. Senza un limite un errore persistente (es. server
// giu') genererebbe un toast ogni volta che riproviamo, all'infinito.
const MAX_TENTATIVI_CARICAMENTO = 3;

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [settings, setSettings] = useState<AccessibilitySettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);
  // Conta i tentativi falliti di caricamento: usato sia per decidere quando
  // rinunciare, sia come dipendenza dell'effect per far ripartire un nuovo
  // tentativo (a differenza di `isLoaded`, che resta false finche' non
  // succede qualcosa - successo o rinuncia - non basterebbe da solo).
  const [tentativiFalliti, setTentativiFalliti] = useState(0);

  const applyAccessibilitySettings = useCallback((newSettings: AccessibilitySettings) => {
    if (typeof window === 'undefined') return;
    
    const root = document.documentElement;

    console.log('[ACCESSIBILITY] Applicazione impostazioni:', newSettings);

    // Applica classe per accessibilità attiva
    if (newSettings.enabled) {
      root.classList.add("accessibility-mode");
      console.log('[ACCESSIBILITY] Aggiunta classe accessibility-mode');
    } else {
      root.classList.remove("accessibility-mode");
    }

    // Alto contrasto
    if (newSettings.highContrast) {
      root.classList.add("high-contrast");
      console.log('[ACCESSIBILITY] Aggiunta classe high-contrast');
    } else {
      root.classList.remove("high-contrast");
    }

    // Riduzione movimento
    if (newSettings.reducedMotion) {
      root.classList.add("reduce-motion");
      console.log('[ACCESSIBILITY] Aggiunta classe reduce-motion');
    } else {
      root.classList.remove("reduce-motion");
    }

    // Testo grande
    if (newSettings.largeText) {
      root.classList.add("large-text");
      console.log('[ACCESSIBILITY] Aggiunta classe large-text');
    } else {
      root.classList.remove("large-text");
    }

    // Dark Mode - gestito SOLO se l'utente ha impostato esplicitamente darkMode=true
    // Altrimenti lascia il controllo al ThemeProvider
    if (newSettings.darkMode) {
      root.classList.add("dark");
      console.log('[ACCESSIBILITY] Forzato dark mode dall\'accessibilità');
    }
    // NOTA: Non rimuoviamo mai .dark qui - lasciamo che ThemeProvider gestisca il caso "sistema"

    // Font Size personalizzato
    if (newSettings.fontSize && newSettings.fontSize !== 16) {
      root.style.fontSize = `${newSettings.fontSize}px`;
      console.log('[ACCESSIBILITY] Font size impostato a:', newSettings.fontSize);
    } else {
      root.style.fontSize = '';
    }

    // Screen reader
    if (newSettings.screenReader) {
      root.setAttribute("data-screen-reader", "true");
      console.log('[ACCESSIBILITY] Attivato screen reader');
    } else {
      root.removeAttribute("data-screen-reader");
    }
  }, []);

  // Carica impostazioni utente dal database
  useEffect(() => {
    if (status === "authenticated" && session?.user?.id && !isLoaded) {
      console.log('[ACCESSIBILITY] Caricamento impostazioni per utente:', session.user.id);
      
      const loadSettings = async () => {
        try {
          const response = await fetch("/api/profilo");
          if (response.ok) {
            const data = await response.json();
            
            console.log('[ACCESSIBILITY] Dati profilo ricevuti:', {
              necessitaAccessibilita: data.necessitaAccessibilita,
              altoContrasto: data.altoContrasto,
              riduzioneMovimento: data.riduzioneMovimento,
              darkMode: data.darkMode,
              dimensioneTesto: data.dimensioneTesto
            });
            
            // Se l'utente ha necessitaAccessibilita attivo, abilita tutte le features
            if (data.necessitaAccessibilita) {
              const enhancedSettings: AccessibilitySettings = {
                enabled: true,
                highContrast: data.altoContrasto || false,
                reducedMotion: data.riduzioneMovimento || false,
                largeText: true, // Attivato automaticamente
                screenReader: true, // Attivato automaticamente
                keyboardNavigation: true, // Sempre attivo
                darkMode: data.darkMode || false,
                fontSize: data.dimensioneTesto || 18, // Default più grande per accessibilità
              };
              console.log('[ACCESSIBILITY] Modalità accessibilità ATTIVA:', enhancedSettings);
              setSettings(enhancedSettings);
              applyAccessibilitySettings(enhancedSettings);
            } else {
              // Impostazioni normali
              const normalSettings: AccessibilitySettings = {
                enabled: false,
                highContrast: data.altoContrasto || false,
                reducedMotion: data.riduzioneMovimento || false,
                largeText: false,
                screenReader: false,
                keyboardNavigation: true,
                darkMode: data.darkMode || false,
                fontSize: data.dimensioneTesto || 16,
              };
              console.log('[ACCESSIBILITY] Modalità standard:', normalSettings);
              setSettings(normalSettings);
              applyAccessibilitySettings(normalSettings);
            }
            // Solo un caricamento riuscito ferma i tentativi: e' l'unico
            // caso in cui le impostazioni mostrate corrispondono a quelle
            // salvate dall'utente.
            setIsLoaded(true);
          } else {
            // PERCHE': prima qui una risposta non-ok (403/500/...) veniva
            // ignorata in silenzio. Chi ha impostato alto contrasto, testo
            // grande o riduzione del movimento restava con le impostazioni
            // di default senza alcun avviso - il caso peggiore possibile
            // per un utente che dipende proprio da queste preferenze.
            console.error("[ACCESSIBILITY] Risposta non ok da /api/profilo:", response.status);
            throw new Error(`Richiesta fallita con stato ${response.status}`);
          }
        } catch (error) {
          console.error("[ACCESSIBILITY] Errore caricamento impostazioni:", error);
          if (tentativiFalliti + 1 >= MAX_TENTATIVI_CARICAMENTO) {
            // Esauriti i tentativi automatici: avvisiamo l'utente e ci
            // fermiamo (isLoaded=true) per non continuare a ritentare
            // all'infinito. Le impostazioni restano quelle di default,
            // ma ora l'utente SA che non sono state applicate.
            toast.error(
              "Non è stato possibile caricare le tue preferenze di accessibilità. Ricarica la pagina per riprovare.",
              { duration: 6000 }
            );
            setIsLoaded(true);
          } else {
            // PERCHE': in precedenza `setIsLoaded(true)` veniva eseguito
            // qui in ogni caso (anche su errore), bloccando per il resto
            // della sessione qualunque nuovo tentativo di caricamento.
            // Incrementando il contatore invece di isLoaded, l'effect
            // riparte automaticamente (vedi le dipendenze sotto) e
            // riprova, fino al limite massimo.
            toast.error("Caricamento preferenze di accessibilità non riuscito, nuovo tentativo...");
            setTentativiFalliti((n) => n + 1);
          }
        }
      };

      loadSettings();
    }
  }, [session?.user?.id, status, isLoaded, applyAccessibilitySettings, tentativiFalliti]);

  const updateSettings = (newSettings: Partial<AccessibilitySettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      applyAccessibilitySettings(updated);
      return updated;
    });
  };

  const toggleAccessibility = (enabled: boolean) => {
    const newSettings: AccessibilitySettings = enabled
      ? {
          enabled: true,
          highContrast: settings.highContrast,
          reducedMotion: settings.reducedMotion,
          largeText: true,
          screenReader: true,
          keyboardNavigation: true,
          darkMode: settings.darkMode,
          fontSize: settings.fontSize || 18,
        }
      : {
          ...defaultSettings,
          highContrast: settings.highContrast,
          reducedMotion: settings.reducedMotion,
          darkMode: settings.darkMode,
          fontSize: settings.fontSize || 16,
        };

    setSettings(newSettings);
    applyAccessibilitySettings(newSettings);
  };

  return (
    <AccessibilityContext.Provider value={{ settings, updateSettings, toggleAccessibility }}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (context === undefined) {
    throw new Error("useAccessibility must be used within an AccessibilityProvider");
  }
  return context;
}
