"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface DashboardAnomalieCardProps {
  noShowRecenti: number;
  postiManutenzione: number;
  prestitiInScadenza: number;
}

export function DashboardAnomalieCard({ noShowRecenti, postiManutenzione, prestitiInScadenza }: DashboardAnomalieCardProps) {
  const router = useRouter();
  const [loadingGestisci, setLoadingGestisci] = useState(false);
  const [loadingControlla, setLoadingControlla] = useState(false);
  const [loadingAlert, setLoadingAlert] = useState(false);

  const handleGestisciNoShow = () => router.push("/admin/anomalie");
  const handleControllaPosti = () => router.push("/admin/posti?filtro=MANUTENZIONE");
  const handleInviaAlert = async () => {
    setLoadingAlert(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      toast.success("Alert inviati", { description: `${prestitiInScadenza} notifiche inviate` });
    } catch {
      toast.error("Errore");
    } finally {
      setLoadingAlert(false);
    }
  };
  const handleVediTutte = () => router.push("/admin/anomalie");

  const hasAnomalies = noShowRecenti > 0 || postiManutenzione > 0 || prestitiInScadenza > 0;

  return (
    <Card className="col-span-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className={`h-5 w-5 ${hasAnomalies ? "text-orange-600" : "text-green-600"}`} />
          Anomalie e Alert
        </CardTitle>
        <CardDescription>
          {hasAnomalies ? "Richiede attenzione operativa" : "Nessuna anomalia rilevata"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {!hasAnomalies && (
            <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed">
              <div className="h-10 w-10 text-green-500 mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
              </div>
              <p>Tutto nella norma!</p>
            </div>
          )}

          {noShowRecenti > 0 && (
            <div className="flex items-center justify-between p-3 border rounded-lg bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900">
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900 dark:text-red-100">{noShowRecenti} No-Show</p>
                <p className="text-xs text-red-700 dark:text-red-300">Da verificare</p>
              </div>
              <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-100" onClick={handleGestisciNoShow} disabled={loadingGestisci}>
                {loadingGestisci ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gestisci"}
              </Button>
            </div>
          )}

          {postiManutenzione > 0 && (
            <div className="flex items-center justify-between p-3 border rounded-lg bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900">
              <div className="flex-1">
                <p className="text-sm font-medium text-orange-900 dark:text-orange-100">{postiManutenzione} Posti Out</p>
                <p className="text-xs text-orange-700 dark:text-orange-300">In Manutenzione</p>
              </div>
              <Button size="sm" variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-100" onClick={handleControllaPosti} disabled={loadingControlla}>
                {loadingControlla ? <Loader2 className="h-4 w-4 animate-spin" /> : "Controlla"}
              </Button>
            </div>
          )}

          {prestitiInScadenza > 0 && (
            <div className="flex items-center justify-between p-3 border rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900">
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">{prestitiInScadenza} Scadenze</p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300">Entro domani</p>
              </div>
              <Button size="sm" variant="outline" className="text-yellow-600 border-yellow-200 hover:bg-yellow-100" onClick={handleInviaAlert} disabled={loadingAlert}>
                {loadingAlert ? <Loader2 className="h-4 w-4 animate-spin" /> : "Alert"}
              </Button>
            </div>
          )}

          {hasAnomalies && (
            <>
              <Separator />
              <Button variant="ghost" className="w-full text-muted-foreground text-xs" onClick={handleVediTutte}>
                Vedi storico completo
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
