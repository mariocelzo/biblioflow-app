# 🦾 Sistema di Accessibilità BiblioFlow

## 📋 Panoramica

Il sistema di accessibilità di BiblioFlow è progettato per attivarsiautomatic automaticamente quando un utente indica di avere necessità di accessibilità durante la registrazione. Tutte le funzionalità possono essere attivate/disattivate manualmente dal profilo utente.

## ✨ Caratteristiche Principali

### 1. **Attivazione Automatica**

- Se `necessitaAccessibilita = true` durante la registrazione → **Modalità Accessibilità ON**
- Tutte le feature di accessibilità si attivano automaticamente
- L'utente può disattivarle singolarmente dal profilo

### 2. **Context Provider Globale**

```tsx
import { useAccessibility } from "@/contexts/accessibility-context";

// In un componente
const { settings, updateSettings, toggleAccessibility } = useAccessibility();
```

### 3. **Classi CSS Dinamiche**

Il provider applica automaticamente classi CSS al `<html>`:

- `.accessibility-mode` - Modalità accessibilità attiva
- `.high-contrast` - Alto contrasto
- `.reduce-motion` - Riduzione movimento
- `.large-text` - Testo ingrandito (18px base)
- `data-screen-reader="true"` - Screen reader attivo

## 🎯 Feature Implementate (WCAG 2.1 AA)

### ✅ Touch Target 44x44px

**Standard WCAG 2.5.5 (Level AAA)**

- Button default: `h-10` (40px) → OK per la maggior parte dei casi
- Button lg: `h-11` (44px) → **Conforme WCAG AAA**
- Input: `h-11` (44px) → **Conforme WCAG AAA**
- Icon button lg: `size-11` (44px) → **Conforme WCAG AAA**

In modalità accessibilità, tutti i touch target vengono automaticamente espansi a minimo 44x44px.

### ✅ Contrasto Colori

**Standard WCAG 1.4.3 (Level AA)**

- Contrasto normale: **4.5:1** per testo normale
- Contrasto normale: **3:1** per testo grande (18px+)
- Modalità high-contrast: **7:1** (Level AAA)

```css
/* Attivazione automatica */
@media (prefers-contrast: more) {
  /* Applica alto contrasto */
}
```

### ✅ Font Size Minimo

**Standard WCAG 1.4.4 (Level AA)**

- Base: **16px** (text-base di default)
- Modalità large-text: **18px base** (112.5%)
- Titoli scalano proporzionalmente

### ✅ Focus Management

**Standard WCAG 2.4.7 (Level AA)**

```css
/* Focus visibile potenziato in accessibilità */
.accessibility-mode *:focus-visible {
  outline: 3px solid var(--primary) !important;
  outline-offset: 3px !important;
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.2) !important;
}
```

### ✅ Riduzione Movimento

**Standard WCAG 2.3.3 (Level AAA)**

```css
@media (prefers-reduced-motion: reduce) {
  /* Disabilita animazioni */
}

.reduce-motion * {
  animation-duration: 0.01ms !important;
  transition-duration: 0.01ms !important;
}
```

### ✅ Skip to Content

**Standard WCAG 2.4.1 (Level A)**

```tsx
<SkipToContent />
```

Link nascosto che appare al focus per saltare al contenuto principale.

### ✅ Screen Reader Support

**Standard WCAG 4.1.3 (Level AA)**

```tsx
import { useAnnouncer } from "@/components/accessibility";

const { announce, LiveAnnouncerComponent } = useAnnouncer();

// Annuncio per screen reader
announce("Prenotazione confermata!", "polite");

// Componente da includere
<LiveAnnouncerComponent />;
```

## 🔧 Utilizzo

### 1. Nel Profilo Utente

```tsx
import { useAccessibility } from "@/contexts/accessibility-context";

export default function ProfilePage() {
  const { settings, toggleAccessibility } = useAccessibility();

  return (
    <Switch checked={settings.enabled} onCheckedChange={toggleAccessibility} />
  );
}
```

### 2. Screen Reader Announcements

```tsx
import { useAnnouncer } from "@/components/accessibility";

export default function BookingPage() {
  const { announce, LiveAnnouncerComponent } = useAnnouncer();

  const handleBooking = async () => {
    // ... logica prenotazione
    announce("Prenotazione completata con successo", "polite");
  };

  return (
    <>
      <LiveAnnouncerComponent />
      {/* resto del componente */}
    </>
  );
}
```

### 3. Skip to Content

```tsx
// Già incluso in layout.tsx
<SkipToContent />

// Nel contenuto principale
<main id="main-content">
  {/* contenuto */}
</main>
```

## 🎨 Classi CSS Utility

### Screen Reader Only

```tsx
<span className="sr-only">Testo solo per screen reader</span>
```

### Skip to Content

```tsx
<a href="#main" className="skip-to-content">
  Vai al contenuto
</a>
```

### Live Region

```tsx
<div aria-live="polite" className="sr-only">
  {announcement}
</div>
```

## 📊 Compatibilità WCAG 2.1

| Criterio                 | Livello | Stato          |
| ------------------------ | ------- | -------------- |
| 1.4.3 Contrast (Minimum) | AA      | ✅ Conforme    |
| 1.4.4 Resize text        | AA      | ✅ Conforme    |
| 1.4.10 Reflow            | AA      | ✅ Conforme    |
| 2.1.1 Keyboard           | A       | 🔄 In Progress |
| 2.4.1 Bypass Blocks      | A       | ✅ Conforme    |
| 2.4.7 Focus Visible      | AA      | ✅ Conforme    |
| 2.5.5 Target Size        | AAA     | ✅ Conforme    |
| 4.1.3 Status Messages    | AA      | ✅ Conforme    |

## 🚀 Prossimi Passi

### Navigazione Tastiera

- [ ] Keyboard shortcuts globali (Ctrl+K per ricerca, ecc.)
- [ ] Focus trap in modali
- [ ] Escape per chiudere modali

### ARIA Labels

- [ ] Completare labels su tutti i componenti interattivi
- [ ] Aggiungere descrizioni contestuali
- [ ] Landmarks ARIA (navigation, main, complementary)

### Testing

- [ ] Test con VoiceOver (macOS/iOS)
- [ ] Test con NVDA (Windows)
- [ ] Test con TalkBack (Android)
- [ ] Test navigazione solo tastiera

## 📚 Risorse

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)
- [A11y Project Checklist](https://www.a11yproject.com/checklist/)

## 🤝 Contribuire

Per aggiungere nuove feature di accessibilità:

1. Aggiornare `AccessibilityContext` se necessario
2. Aggiungere classi CSS in `globals.css`
3. Testare con screen reader
4. Aggiornare questa documentazione
5. Aggiornare ROADMAP.md

---

**Nota**: Il sistema è progettato per essere opt-in automatico solo per utenti che ne hanno bisogno, ma sempre accessibile a tutti.
