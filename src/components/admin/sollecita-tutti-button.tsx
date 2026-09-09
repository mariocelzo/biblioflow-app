"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

// COSA: bottone "Sollecita Tutti" della pagina admin prestiti
// (src/app/admin/prestiti/page.tsx).
//
// PERCHE' ESISTE: prima era un <form action="/api/admin/prestiti"
// method="POST"> senza campi. Senza `enctype`, il browser manda una
// NAVIGAZIONE con un body "application/x-www-form-urlencoded" vuoto: la
// route fa `await req.json()`, che lancia un SyntaxError su un body del
// genere, e risponde 500. Trattandosi di una navigazione (non una fetch), la
// pagina admin veniva interamente sostituita dal JSON grezzo dell'errore
// (rilievo #2 dell'audit).
//
// Il fix: una fetch JSON esplicita verso la stessa azione SOLLECITA_MULTIPLI
// gia' gestita da /api/admin/prestiti, con lo stesso pattern usato dal
// componente gemello prestiti-actions.tsx per le azioni sul singolo prestito.
interface Props {
  prestitoIds: string[];
}

export function SollecitaTuttiButton({ prestitoIds }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/prestiti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ azione: "SOLLECITA_MULTIPLI", prestitoIds }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Errore durante l'invio dei solleciti");
      }

      toast.success(data.message || "Solleciti inviati");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Errore durante l'invio dei solleciti";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" className="gap-2" onClick={handleClick} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
      Sollecita Tutti ({prestitoIds.length})
    </Button>
  );
}
