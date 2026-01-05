"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { useState } from "react";

export default function PrestitiFiltri() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [stato, setStato] = useState(searchParams.get("stato") || "tutti");
  const [scadenza, setScadenza] = useState(searchParams.get("scadenza") || "tutti");
  const [utente, setUtente] = useState(searchParams.get("utente") || "");

  const applicaFiltri = () => {
    const params = new URLSearchParams();
    
    if (stato && stato !== "tutti") params.set("stato", stato);
    if (scadenza && scadenza !== "tutti") params.set("scadenza", scadenza);
    if (utente) params.set("utente", utente);
    
    router.push(`/admin/prestiti?${params.toString()}`);
  };

  const resetFiltri = () => {
    setStato("tutti");
    setScadenza("tutti");
    setUtente("");
    router.push("/admin/prestiti");
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Stato</Label>
            <Select value={stato} onValueChange={setStato}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti gli stati</SelectItem>
                <SelectItem value="ATTIVO">Attivo</SelectItem>
                <SelectItem value="RESTITUITO">Restituito</SelectItem>
                <SelectItem value="RINNOVATO">Rinnovato</SelectItem>
                <SelectItem value="SCADUTO">Scaduto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Scadenza</Label>
            <Select value={scadenza} onValueChange={setScadenza}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutte</SelectItem>
                <SelectItem value="scaduti">Solo scaduti</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Cerca Utente</Label>
            <Input
              placeholder="Nome, cognome, email..."
              value={utente}
              onChange={(e) => setUtente(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label className="invisible">Azioni</Label>
            <div className="flex gap-2">
              <Button onClick={applicaFiltri} className="flex-1">
                <Search className="h-4 w-4 mr-2" />
                Filtra
              </Button>
              <Button onClick={resetFiltri} variant="outline">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
