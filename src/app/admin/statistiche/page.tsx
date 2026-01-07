import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, Users, BookOpen } from "lucide-react";

// Lazy load del componente Charts (pesante)
const StatisticheCharts = dynamic(() => import("@/components/admin/statistiche-charts"), {
  loading: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card><CardContent className="p-6"><div className="h-80 animate-pulse bg-muted rounded" /></CardContent></Card>
      <Card><CardContent className="p-6"><div className="h-80 animate-pulse bg-muted rounded" /></CardContent></Card>
    </div>
  ),
  ssr: false,
});

export default async function StatisticheAdminPage() {
  const session = await auth();

  if (!session?.user || (session.user.ruolo !== "ADMIN" && session.user.ruolo !== "BIBLIOTECARIO")) {
    redirect("/login");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Statistiche Avanzate</h1>
        <p className="text-muted-foreground">
          Analisi dettagliata dell&apos;utilizzo della biblioteca
        </p>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-sm font-medium">Occupazione Oraria</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Prenotazioni per fascia oraria (ultimi 7 giorni)
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <CardTitle className="text-sm font-medium">Trend Temporale</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Andamento prenotazioni giornaliere (30 giorni)
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-500" />
              <CardTitle className="text-sm font-medium">Utenti Attivi</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Top 10 utenti più attivi
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-orange-500" />
              <CardTitle className="text-sm font-medium">Libri Popolari</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Top 10 libri più prestati
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Container */}
      <StatisticheCharts />
    </div>
  );
}
