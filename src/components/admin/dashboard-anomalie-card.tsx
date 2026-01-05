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
}

export function DashboardAnomalieCard({ noShowRecenti }: DashboardAnomalieCardProps) {
  const router = useRouter();
  const [loadingGestisci, setLoadingGestisci] = useState(false);
  const [loadingControlla, setLoadingControlla] = useState(false);
  const [loadingAlert, setLoadingAlert] = useState(false);

  const handleGestisciNoShow = () => {
    router.push("/admin/anomalie");
  };

  const handleControllaPosti = () => {
    router.push("/admin/posti?filtro=MANUTENZIONE");
  };

  const handleInviaAlert = async () => {
    setLoadingAlert(true);
    try {
      // Simula invio alert per prestiti in scadenza
      await new Promise((resolve) => setTimeout(resolve, 1500));
      toast.success("Alert inviati", {
        description: "5 notifiche inviate per i prestiti in scadenza",
      });
    } catch (error) {
      toast.error("Errore nell'invio degli alert");
    } finally {
      setLoadingAlert(false);
    }
  };

  const handleVediTutte = () => {
    router.push("/admin/anomalie");
  };

  return (
    <Card className="col-span-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          Anomalie e Alert
        </CardTitle>
        <CardDescription>Richiede attenzione</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 border rounded-lg bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900">
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900 dark:text-red-100">
                {noShowRecenti} No-Show
              </p>
              <p className="text-xs text-red-700 dark:text-red-300">Ultimi 7 giorni</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600"
              onClick={handleGestisciNoShow}
              disabled={loadingGestisci}
            >
              {loadingGestisci ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Gestisci"
              )}
            </Button>
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-900">
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                2 Posti in Manutenzione
              </p>
              <p className="text-xs text-orange-700 dark:text-orange-300">
                Da oltre 3 giorni
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-orange-600"
              onClick={handleControllaPosti}
              disabled={loadingControlla}
            >
              {loadingControlla ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Controlla"
              )}
            </Button>
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-900">
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                5 Prestiti in Scadenza
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300">Entro domani</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-yellow-600"
              onClick={handleInviaAlert}
              disabled={loadingAlert}
            >
              {loadingAlert ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Invia Alert"
              )}
            </Button>
          </div>

          <Separator />

          <Button variant="outline" className="w-full" onClick={handleVediTutte}>
            Vedi tutte le anomalie
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
