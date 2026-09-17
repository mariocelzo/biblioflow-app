"use client";

// Filtri della pagina /admin/utenti.
// PRIMA: campo di ricerca, select ruolo/stato e bottone "Applica Filtri"
// esistevano solo a video, senza alcun gestore. Stesso pattern gia' usato in
// prenotazioni-filtri.tsx, prestiti-filtri.tsx e posti-filtri.tsx: la query
// string viene scritta qui e letta lato server nella page.
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { useState } from "react";

export default function UtentiFiltri() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [ruolo, setRuolo] = useState(searchParams.get("ruolo") || "tutti");
  const [stato, setStato] = useState(searchParams.get("stato") || "tutti");

  const applicaFiltri = () => {
    const params = new URLSearchParams();

    if (query) params.set("q", query);
    if (ruolo && ruolo !== "tutti") params.set("ruolo", ruolo);
    if (stato && stato !== "tutti") params.set("stato", stato);

    router.push(`/admin/utenti?${params.toString()}`);
  };

  const resetFiltri = () => {
    setQuery("");
    setRuolo("tutti");
    setStato("tutti");
    router.push("/admin/utenti");
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="flex-1 space-y-2">
            <Label>Cerca utente</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nome, cognome o email..."
                className="pl-10"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="md:w-48 space-y-2">
            <Label>Ruolo</Label>
            <Select value={ruolo} onValueChange={setRuolo}>
              <SelectTrigger>
                <SelectValue placeholder="Tutti i ruoli" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="STUDENTE">Studenti</SelectItem>
                <SelectItem value="BIBLIOTECARIO">Bibliotecari</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:w-48 space-y-2">
            <Label>Stato</Label>
            <Select value={stato} onValueChange={setStato}>
              <SelectTrigger>
                <SelectValue placeholder="Tutti gli stati" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="attivo">Attivi</SelectItem>
                <SelectItem value="disattivato">Disattivati</SelectItem>
                <SelectItem value="verificato">Email verificata</SelectItem>
                <SelectItem value="non-verificato">Email non verificata</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button onClick={applicaFiltri} className="gap-2">
              <Search className="h-4 w-4" />
              Applica Filtri
            </Button>
            <Button onClick={resetFiltri} variant="outline" size="icon" aria-label="Azzera filtri">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
