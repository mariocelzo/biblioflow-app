"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useRouter } from "next/navigation";
import { CheckCircle2, Activity, AlertTriangle, BookOpen } from "lucide-react";

interface Activity {
  tipo: string;
  utente: string;
  azione: string;
  tempo: string;
  iconName: string;
  color: string;
}

interface DashboardActivityCardProps {
  activities: Activity[];
}

const iconMap = {
  CheckCircle2,
  Activity,
  AlertTriangle,
  BookOpen,
};

export function DashboardActivityCard({ activities }: DashboardActivityCardProps) {
  const router = useRouter();

  const handleVediTutto = () => {
    // Reindirizza alla pagina dello storico eventi/log
    router.push("/admin/anomalie"); // Cambia con la rotta appropriata quando disponibile
  };

  return (
    <Card className="col-span-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Attività Recente</CardTitle>
            <CardDescription>Eventi e azioni degli ultimi minuti</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleVediTutto}>
            Vedi tutto
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity, index) => {
            const Icon = iconMap[activity.iconName as keyof typeof iconMap] || CheckCircle2;
            return (
              <div key={index}>
                <div className="flex items-start gap-4">
                  <div className={`rounded-full p-2 ${activity.color} bg-opacity-10`}>
                    <Icon className={`h-4 w-4 ${activity.color}`} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {activity.utente}
                    </p>
                    <p className="text-sm text-muted-foreground">{activity.azione}</p>
                    <p className="text-xs text-muted-foreground">{activity.tempo}</p>
                  </div>
                </div>
                {index < activities.length - 1 && <Separator className="mt-4" />}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
