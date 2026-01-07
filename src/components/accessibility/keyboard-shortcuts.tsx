"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Keyboard } from "lucide-react";

interface Shortcut {
  keys: string[];
  description: string;
  action: () => void;
  category: "navigation" | "actions" | "accessibility";
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const { data: session } = useSession();
  const [showHelp, setShowHelp] = useState(false);

  const isAdmin = session?.user?.ruolo === "ADMIN" || session?.user?.ruolo === "BIBLIOTECARIO";

  // Definizione shortcuts
  const shortcuts: Shortcut[] = [
    // Navigazione
    {
      keys: ["Alt", "H"],
      description: "Vai alla Home",
      action: () => router.push("/"),
      category: "navigation",
    },
    {
      keys: ["Alt", "P"],
      description: "Prenota un posto",
      action: () => router.push("/prenota"),
      category: "navigation",
    },
    {
      keys: ["Alt", "R"],
      description: "Le mie prenotazioni",
      action: () => router.push("/prenotazioni"),
      category: "navigation",
    },
    {
      keys: ["Alt", "L"],
      description: "Catalogo libri",
      action: () => router.push("/libri"),
      category: "navigation",
    },
    {
      keys: ["Alt", "B"],
      description: "I miei prestiti",
      action: () => router.push("/prestiti"),
      category: "navigation",
    },
    {
      keys: ["Alt", "N"],
      description: "Notifiche",
      action: () => router.push("/notifiche"),
      category: "navigation",
    },
    {
      keys: ["Alt", "U"],
      description: "Profilo utente",
      action: () => router.push("/profilo"),
      category: "navigation",
    },
    // Azioni
    {
      keys: ["Alt", "S"],
      description: "Focus sulla ricerca",
      action: () => {
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[type="search"], input[placeholder*="Cerca"], input[aria-label*="Cerca"]'
        );
        searchInput?.focus();
      },
      category: "actions",
    },
    {
      keys: ["Escape"],
      description: "Chiudi dialog/modal",
      action: () => {
        // Gestito nativamente dai dialog
      },
      category: "actions",
    },
    // Accessibilità
    {
      keys: ["Alt", "?"],
      description: "Mostra scorciatoie tastiera",
      action: () => setShowHelp(true),
      category: "accessibility",
    },
    {
      keys: ["Alt", "M"],
      description: "Vai al contenuto principale",
      action: () => {
        const main = document.getElementById("main-content");
        if (main) {
          main.focus();
          main.scrollIntoView({ behavior: "smooth" });
        }
      },
      category: "accessibility",
    },
  ];

  // Aggiungi shortcuts admin se utente è admin
  if (isAdmin) {
    shortcuts.push({
      keys: ["Alt", "A"],
      description: "Dashboard Admin",
      action: () => router.push("/admin"),
      category: "navigation",
    });
  }

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignora se focus è in un input/textarea
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        // Permetti solo Alt+? per help
        if (!(event.altKey && event.key === "?")) {
          return;
        }
      }

      // Trova lo shortcut corrispondente
      for (const shortcut of shortcuts) {
        const needsAlt = shortcut.keys.includes("Alt");
        const needsCtrl = shortcut.keys.includes("Ctrl");
        const needsShift = shortcut.keys.includes("Shift");
        const key = shortcut.keys.find(
          (k) => !["Alt", "Ctrl", "Shift"].includes(k)
        );

        if (
          event.altKey === needsAlt &&
          event.ctrlKey === needsCtrl &&
          event.shiftKey === needsShift &&
          event.key.toLowerCase() === key?.toLowerCase()
        ) {
          event.preventDefault();
          shortcut.action();
          break;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const groupedShortcuts = {
    navigation: shortcuts.filter((s) => s.category === "navigation"),
    actions: shortcuts.filter((s) => s.category === "actions"),
    accessibility: shortcuts.filter((s) => s.category === "accessibility"),
  };

  return (
    <Dialog open={showHelp} onOpenChange={setShowHelp}>
      <DialogContent className="max-w-lg" aria-describedby="shortcuts-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" aria-hidden="true" />
            Scorciatoie da Tastiera
          </DialogTitle>
          <DialogDescription id="shortcuts-description">
            Usa queste combinazioni per navigare più velocemente
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Navigazione */}
          <section aria-labelledby="nav-shortcuts">
            <h3 id="nav-shortcuts" className="text-sm font-semibold text-muted-foreground mb-2">
              Navigazione
            </h3>
            <div className="space-y-2">
              {groupedShortcuts.navigation.map((shortcut, idx) => (
                <ShortcutRow key={idx} shortcut={shortcut} />
              ))}
            </div>
          </section>

          {/* Azioni */}
          <section aria-labelledby="action-shortcuts">
            <h3 id="action-shortcuts" className="text-sm font-semibold text-muted-foreground mb-2">
              Azioni
            </h3>
            <div className="space-y-2">
              {groupedShortcuts.actions.map((shortcut, idx) => (
                <ShortcutRow key={idx} shortcut={shortcut} />
              ))}
            </div>
          </section>

          {/* Accessibilità */}
          <section aria-labelledby="a11y-shortcuts">
            <h3 id="a11y-shortcuts" className="text-sm font-semibold text-muted-foreground mb-2">
              Accessibilità
            </h3>
            <div className="space-y-2">
              {groupedShortcuts.accessibility.map((shortcut, idx) => (
                <ShortcutRow key={idx} shortcut={shortcut} />
              ))}
            </div>
          </section>
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Premi <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Alt + ?</kbd> in qualsiasi momento per visualizzare questa guida
        </p>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm">{shortcut.description}</span>
      <div className="flex gap-1">
        {shortcut.keys.map((key, idx) => (
          <Badge key={idx} variant="secondary" className="font-mono text-xs">
            {key}
          </Badge>
        ))}
      </div>
    </div>
  );
}
