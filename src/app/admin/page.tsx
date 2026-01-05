import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  MapPin,
  Calendar,
  TrendingUp,
  Clock,
  BookOpen,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import db from "@/lib/prisma";
import { DashboardAnomalieCard } from "@/components/admin/dashboard-anomalie-card";
import { DashboardActivityCard } from "@/components/admin/dashboard-activity-card";

export default async function AdminDashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.ruolo !== "BIBLIOTECARIO" && session.user.ruolo !== "ADMIN") {
    redirect("/");
  }

  // Fetch statistiche
  const now = new Date();
  const oggi = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const domani = new Date(oggi);
  domani.setDate(domani.getDate() + 1);
  const setteGiorniFa = new Date(oggi);
  setteGiorniFa.setDate(setteGiorniFa.getDate() - 7);

  const [
    totaleUtenti,
    totalePosti,
    prenotazioniOggi,
    prenotazioniCheckIn,
    prestitiAttivi,
    noShowRecentiTutti,
    postiDisponibili,
  ] = await Promise.all([
    db.user.count(),
    db.posto.count(),
    db.prenotazione.count({
      where: {
        data: oggi,
      },
    }),
    db.prenotazione.count({
      where: {
        stato: "CHECK_IN",
      },
    }),
    db.prestito.count({
      where: {
        dataRestituzione: null,
      },
    }),
    db.logEvento.findMany({
      where: {
        tipo: "NO_SHOW",
        createdAt: {
          gte: setteGiorniFa,
        },
      },
      select: {
        id: true,
        dettagli: true,
      },
    }),
    db.posto.count({
      where: {
        stato: "DISPONIBILE",
      },
    }),
  ]);

  // Filtra solo NO_SHOW non risolti
  const noShowRecenti = noShowRecentiTutti.filter((evento) => {
    const dettagli = evento.dettagli as { risolto?: boolean } | null;
    return !dettagli?.risolto;
  }).length;

  const tassoOccupazione = ((totalePosti - postiDisponibili) / totalePosti) * 100;

  const stats = [
    {
      title: "Prenotazioni Attive",
      value: prenotazioniCheckIn,
      description: `${prenotazioniOggi} prenotazioni oggi`,
      icon: Calendar,
      trend: "+12%",
      trendUp: true,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-950",
    },
    {
      title: "Utenti Totali",
      value: totaleUtenti,
      description: "Studenti registrati",
      icon: Users,
      trend: "+5%",
      trendUp: true,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-950",
    },
    {
      title: "Occupazione Posti",
      value: `${Math.round(tassoOccupazione)}%`,
      description: `${totalePosti - postiDisponibili}/${totalePosti} occupati`,
      icon: MapPin,
      trend: "-3%",
      trendUp: false,
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-100 dark:bg-orange-950",
    },
    {
      title: "Prestiti Attivi",
      value: prestitiAttivi,
      description: "Libri in prestito",
      icon: BookOpen,
      trend: "+8%",
      trendUp: true,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-950",
    },
  ];

  const recentActivity = [
    {
      tipo: "PRENOTAZIONE",
      utente: "Mario Rossi",
      azione: "ha prenotato il Posto A-12",
      tempo: "2 minuti fa",
      iconName: "CheckCircle2",
      color: "text-green-600",
    },
    {
      tipo: "CHECK_IN",
      utente: "Laura Bianchi",
      azione: "ha fatto check-in al Posto B-05",
      tempo: "15 minuti fa",
      iconName: "Activity",
      color: "text-blue-600",
    },
    {
      tipo: "NO_SHOW",
      utente: "Giuseppe Verdi",
      azione: "non si è presentato (Posto C-08)",
      tempo: "1 ora fa",
      iconName: "AlertTriangle",
      color: "text-red-600",
    },
    {
      tipo: "PRESTITO",
      utente: "Anna Ferrari",
      azione: "ha preso in prestito 'Clean Code'",
      tempo: "2 ore fa",
      iconName: "BookOpen",
      color: "text-purple-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Dashboard Amministratore
          </h1>
          <p className="text-muted-foreground">
            Panoramica e statistiche della biblioteca
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            Aggiornato ora
          </Badge>
        </div>
      </div>

      {/* Statistiche Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`rounded-lg p-2 ${stat.bgColor}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
                  <div
                    className={`flex items-center gap-1 text-xs font-medium ${
                      stat.trendUp ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {stat.trendUp ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )}
                    {stat.trend}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Attività Recente */}
        <DashboardActivityCard activities={recentActivity} />

        {/* Anomalie e Alert */}
        <DashboardAnomalieCard noShowRecenti={noShowRecenti} />
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Azioni Rapide</CardTitle>
          <CardDescription>Operazioni frequenti</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" className="justify-start gap-2" asChild>
              <a href="/admin/posti">
                <MapPin className="h-4 w-4" />
                Gestisci Posti
              </a>
            </Button>
            <Button variant="outline" className="justify-start gap-2" asChild>
              <a href="/admin/utenti">
                <Users className="h-4 w-4" />
                Vedi Utenti
              </a>
            </Button>
            <Button variant="outline" className="justify-start gap-2" asChild>
              <a href="/admin/prenotazioni">
                <Calendar className="h-4 w-4" />
                Prenotazioni
              </a>
            </Button>
            <Button variant="outline" className="justify-start gap-2" asChild>
              <a href="/admin/statistiche">
                <TrendingUp className="h-4 w-4" />
                Statistiche
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
