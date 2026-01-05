"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { useState } from "react";

export default function PrenotazioniFiltri() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [stato, setStato] = useState(searchParams.get("stato") || "tutti");
  const [data, setData] = useState(searchParams.get("data") || "");
  const [utente, setUtente] = useState(searchParams.get("utente") || "");

  const applicaFiltri = () => {
    const params = new URLSearchParams();
    
    if (stato && stato !== "tutti") params.set("stato", stato);
    if (data) params.set("data", data);
    if (utente) params.set("utente", utente);
    
    router.push(`/admin/prenotazioni?${params.toString()}`);
  };

  const resetFiltri = () => {
    setStato("tutti");
    setData("");
    setUtente("");
    router.push("/admin/prenotazioni");
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
                <SelectItem value="CONFERMATA">Confermata</SelectItem>
                <SelectItem value="CHECK_IN">Check-in</SelectItem>
                <SelectItem value="COMPLETATA">Completata</SelectItem>
                <SelectItem value="CANCELLATA">Cancellata</SelectItem>
                <SelectItem value="NO_SHOW">No-show</SelectItem>
                <SelectItem value="SCADUTA">Scaduta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Data</Label>
            <Input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label>Cerca Utente</Label>
            <Input
              placeholder="Nome, cognome, email, matricola..."
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
