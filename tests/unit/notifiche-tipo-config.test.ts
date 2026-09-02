import { describe, expect, it } from "vitest";
import { getTipoConfig } from "@/app/notifiche/tipo-config";

/**
 * Test per getTipoConfig: verificare che
 * 1. I 5 tipi storici mantengono la loro configurazione (resa identica)
 * 2. I 5 nuovi tipi ricevono una configurazione sensata
 * 3. Qualsiasi tipo sconosciuto riceve il fallback neutro
 */
describe("getTipoConfig", () => {
  // Tipi storici
  describe("Tipi storici (resa identica)", () => {
    it("PRENOTAZIONE ha icona, colore e label corretti", () => {
      const config = getTipoConfig("PRENOTAZIONE");
      expect(config.label).toBe("Prenotazione");
      expect(config.colore).toBe("bg-blue-100 text-blue-800");
      expect(config.icona).toBeDefined();
    });

    it("CHECK_IN_REMINDER ha icona, colore e label corretti", () => {
      const config = getTipoConfig("CHECK_IN_REMINDER");
      expect(config.label).toBe("Check-in");
      expect(config.colore).toBe("bg-orange-100 text-orange-800");
      expect(config.icona).toBeDefined();
    });

    it("SCADENZA_PRESTITO ha icona, colore e label corretti", () => {
      const config = getTipoConfig("SCADENZA_PRESTITO");
      expect(config.label).toBe("Prestito");
      expect(config.colore).toBe("bg-red-100 text-red-800");
      expect(config.icona).toBeDefined();
    });

    it("SISTEMA ha icona, colore e label corretti", () => {
      const config = getTipoConfig("SISTEMA");
      expect(config.label).toBe("Sistema");
      expect(config.colore).toBe("bg-gray-100 text-gray-800");
      expect(config.icona).toBeDefined();
    });

    it("PROMO ha icona, colore e label corretti", () => {
      const config = getTipoConfig("PROMO");
      expect(config.label).toBe("Promozione");
      expect(config.colore).toBe("bg-purple-100 text-purple-800");
      expect(config.icona).toBeDefined();
    });
  });

  // Nuovi tipi
  describe("Nuovi tipi (Fase 2)", () => {
    it("ALERT ha icona, colore e label definiti", () => {
      const config = getTipoConfig("ALERT");
      expect(config.label).toBe("Avviso");
      expect(config.colore).toBe("bg-red-100 text-red-800");
      expect(config.icona).toBeDefined();
    });

    it("INFO ha icona, colore e label definiti", () => {
      const config = getTipoConfig("INFO");
      expect(config.label).toBe("Info");
      expect(config.colore).toBe("bg-gray-100 text-gray-800");
      expect(config.icona).toBeDefined();
    });

    it("CODA_INGRESSO ha icona, colore e label definiti", () => {
      const config = getTipoConfig("CODA_INGRESSO");
      expect(config.label).toBe("Lista d'attesa");
      expect(config.colore).toBe("bg-indigo-100 text-indigo-800");
      expect(config.icona).toBeDefined();
    });

    it("CODA_PROMOZIONE ha icona, colore e label definiti", () => {
      const config = getTipoConfig("CODA_PROMOZIONE");
      expect(config.label).toBe("Promozione coda");
      expect(config.colore).toBe("bg-green-100 text-green-800");
      expect(config.icona).toBeDefined();
    });

    it("CODA_SCADENZA ha icona, colore e label definiti", () => {
      const config = getTipoConfig("CODA_SCADENZA");
      expect(config.label).toBe("Coda scaduta");
      expect(config.colore).toBe("bg-orange-100 text-orange-800");
      expect(config.icona).toBeDefined();
    });
  });

  // Fallback
  describe("Fallback neutro per tipi sconosciuti", () => {
    it("Tipo sconosciuto riceve fallback neutro", () => {
      const config = getTipoConfig("TIPO_INVENTATO");
      expect(config.label).toBe("Notifica");
      expect(config.colore).toBe("bg-gray-100 text-gray-800");
      expect(config.icona).toBeDefined();
      // Nessun undefined nel DOM
      expect(config.icona).not.toBeNull();
      expect(config.icona).not.toBeUndefined();
    });

    it("String vuota riceve fallback neutro", () => {
      const config = getTipoConfig("");
      expect(config.label).toBe("Notifica");
      expect(config.colore).toBe("bg-gray-100 text-gray-800");
      expect(config.icona).toBeDefined();
    });

    it("null-like string riceve fallback neutro", () => {
      const config = getTipoConfig("NULL");
      expect(config.label).toBe("Notifica");
      expect(config.colore).toBe("bg-gray-100 text-gray-800");
      expect(config.icona).toBeDefined();
    });
  });

  // Verifica che i campi non siano mai undefined
  describe("Validazione output: nessun undefined", () => {
    const tipi = [
      "PRENOTAZIONE",
      "CHECK_IN_REMINDER",
      "SCADENZA_PRESTITO",
      "SISTEMA",
      "PROMO",
      "ALERT",
      "INFO",
      "CODA_INGRESSO",
      "CODA_PROMOZIONE",
      "CODA_SCADENZA",
      "TIPO_SCONOSCIUTO",
    ];

    tipi.forEach((tipo) => {
      it(`getTipoConfig("${tipo}") ritorna configurazione completa`, () => {
        const config = getTipoConfig(tipo);
        expect(config.icona).toBeDefined();
        expect(config.colore).toBeDefined();
        expect(config.label).toBeDefined();
        expect(typeof config.colore).toBe("string");
        expect(typeof config.label).toBe("string");
        expect(config.colore).not.toBe("");
        expect(config.label).not.toBe("");
      });
    });
  });
});
