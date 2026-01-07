"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";

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

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [settings, setSettings] = useState<AccessibilitySettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

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
          }
        } catch (error) {
          console.error("[ACCESSIBILITY] Errore caricamento impostazioni:", error);
        } finally {
          setIsLoaded(true);
        }
      };

      loadSettings();
    }
  }, [session?.user?.id, status, isLoaded, applyAccessibilitySettings]);

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
