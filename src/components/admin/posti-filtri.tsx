"use client";

// Filtri della pagina /admin/posti.
// PRIMA: input di ricerca, select sala/stato e bottone "Applica Filtri"
// esistevano solo visivamente, senza alcun gestore: cliccarli non filtrava
// nulla. Qui si segue lo stesso pattern gia' in uso in
// prenotazioni-filtri.tsx e prestiti-filtri.tsx (query string + router.push,
// letta lato server nella page).
// Le sale nel <Select> arrivano come prop dal Server Component (dati veri
// dal DB): prima erano tre voci scritte a mano ("Sala Silenziosa", "Sala
// Gruppi", "Sala Studio") che non corrispondevano ai nomi reali delle sale
// seminate ("Sala Lettura Silenziosa", "Sala Gruppi", "Sala Studio
// Principale"), quindi non avrebbero comunque mai potuto funzionare.
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { useState } from "react";

interface PostiFiltriProps {
  sale: { id: string; nome: string }[];
}

export default function PostiFiltri({ sale }: PostiFiltriProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [numero, setNumero] = useState(searchParams.get("numero") || "");
  const [salaId, setSalaId] = useState(searchParams.get("sala") || "tutte");
  const [stato, setStato] = useState(searchParams.get("stato") || "tutti");

  const applicaFiltri = () => {
    const params = new URLSearchParams();

    if (numero) params.set("numero", numero);
    if (salaId && salaId !== "tutte") params.set("sala", salaId);
    if (stato && stato !== "tutti") params.set("stato", stato);

    router.push(`/admin/posti?${params.toString()}`);
  };

  const resetFiltri = () => {
    setNumero("");
    setSalaId("tutte");
    setStato("tutti");
    router.push("/admin/posti");
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="flex-1 space-y-2">
            <Label>Cerca per numero</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Es: A-12, B-05..."
                className="pl-10"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
              />
            </div>
          </div>

          <div className="md:w-56 space-y-2">
            <Label>Sala</Label>
            <Select value={salaId} onValueChange={setSalaId}>
              <SelectTrigger>
                <SelectValue placeholder="Tutte le sale" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tutte">Tutte le sale</SelectItem>
                {sale.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
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
                <SelectItem value="DISPONIBILE">Disponibile</SelectItem>
                <SelectItem value="OCCUPATO">Occupato</SelectItem>
                <SelectItem value="MANUTENZIONE">Manutenzione</SelectItem>
                <SelectItem value="RISERVATO">Riservato</SelectItem>
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
