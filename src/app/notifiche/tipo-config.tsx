"use client";

import React from "react";
import {
  Bell,
  BookOpen,
  Calendar,
  CheckCheck,
  Clock,
  Info,
  AlertCircle,
  Megaphone,
} from "lucide-react";

/**
 * Configurazione per ogni tipo di notifica
 * Supporta tipi storici e nuovi, con fallback neutro per tipi sconosciuti
 */
export interface TipoConfig {
  icona: React.ReactNode;
  colore: string; // Tailwind classe
  label: string;
}

/**
 * Restituisce la configurazione (icona, colore, label) per un dato tipo di notifica
 * - Per i 5 tipi storici: resa identica a quella originale
 * - Per i 5 nuovi tipi: configurazione sensata
 * - Per qualsiasi altro tipo: fallback neutro (non genera mai undefined)
 */
export function getTipoConfig(tipo: string): TipoConfig {
  // Mappa consolidata: tipo → {icona, colore, label}
  const configs: Record<string, TipoConfig> = {
    // Tipi storici (resa identica a prima)
    PRENOTAZIONE: {
      icona: <Calendar className="h-5 w-5 text-blue-500" />,
      colore: "bg-blue-100 text-blue-800",
      label: "Prenotazione",
    },
    CHECK_IN_REMINDER: {
      icona: <Clock className="h-5 w-5 text-orange-500" />,
      colore: "bg-orange-100 text-orange-800",
      label: "Check-in",
    },
    SCADENZA_PRESTITO: {
      icona: <BookOpen className="h-5 w-5 text-red-500" />,
      colore: "bg-red-100 text-red-800",
      label: "Prestito",
    },
    SISTEMA: {
      icona: <Info className="h-5 w-5 text-gray-500" />,
      colore: "bg-gray-100 text-gray-800",
      label: "Sistema",
    },
    PROMO: {
      icona: <Megaphone className="h-5 w-5 text-purple-500" />,
      colore: "bg-purple-100 text-purple-800",
      label: "Promozione",
    },

    // Nuovi tipi (Fase 2)
    ALERT: {
      icona: <AlertCircle className="h-5 w-5 text-red-600" />,
      colore: "bg-red-100 text-red-800",
      label: "Avviso",
    },
    INFO: {
      icona: <Info className="h-5 w-5 text-gray-500" />,
      colore: "bg-gray-100 text-gray-800",
      label: "Info",
    },
    CODA_INGRESSO: {
      icona: <Bell className="h-5 w-5 text-indigo-500" />,
      colore: "bg-indigo-100 text-indigo-800",
      label: "Lista d'attesa",
    },
    CODA_PROMOZIONE: {
      icona: <CheckCheck className="h-5 w-5 text-green-600" />,
      colore: "bg-green-100 text-green-800",
      label: "Promozione coda",
    },
    CODA_SCADENZA: {
      icona: <Clock className="h-5 w-5 text-orange-500" />,
      colore: "bg-orange-100 text-orange-800",
      label: "Coda scaduta",
    },
  };

  // Restituisci la config specifica, oppure fallback neutro
  return (
    configs[tipo] || {
      icona: <Bell className="h-5 w-5 text-gray-500" />,
      colore: "bg-gray-100 text-gray-800",
      label: "Notifica",
    }
  );
}
