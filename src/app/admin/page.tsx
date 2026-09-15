import type { Metadata } from "next";
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
} from "lucide-react";
import db from "@/lib/prisma";
import { DashboardAnomalieCard } from "@/components/admin/dashboard-anomalie-card";
import { DashboardActivityCard } from "@/components/admin/dashboard-activity-card";
import { RichiesteCard } from "@/components/admin/richieste-card"; // Placeholder per nuova card
import { formattaTempoRelativo } from "@/lib/admin-tempo";

// Traduce ogni TipoEvento (schema Prisma) in icona/colori/etichetta per la
// card "Attività Recente". Serve solo come RIPIEGO: la maggior parte dei
// LogEvento ha gia' una `descrizione` scritta al momento della creazione
// (es. "Prenotazione creata per posto A-12"), qui usata quando manca.
const METADATA_EVENTO: Record<
  string,
  { iconName: string; color: string; bgColor: string; label: string }
> = {
  PRENOTAZIONE_CREATA: { iconName: "Calendar", color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-100 dark:bg-blue-950", label: "ha creato una prenotazione" },
  PRENOTAZIONE_CANCELLATA: { iconName: "XCircle", color: "text-red-600 dark:text-red-400", bgColor: "bg-red-100 dark:bg-red-950", label: "ha annullato una prenotazione" },
  CHECK_IN: { iconName: "CheckCircle2", color: "text-green-600 dark:text-green-400", bgColor: "bg-green-100 dark:bg-green-950", label: "ha effettuato il check-in" },
  CHECK_OUT: { iconName: "LogOut", color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-100 dark:bg-blue-950", label: "ha effettuato il check-out" },
  NO_SHOW: { iconName: "AlertTriangle", color: "text-red-600 dark:text-red-400", bgColor: "bg-red-100 dark:bg-red-950", label: "non si è presentato alla prenotazione" },
  NO_SHOW_AUTO: { iconName: "AlertTriangle", color: "text-orange-600 dark:text-orange-400", bgColor: "bg-orange-100 dark:bg-orange-950", label: "posto rilasciato automaticamente per no-show" },
  PRESTITO_CREATO: { iconName: "BookOpen", color: "text-purple-600 dark:text-purple-400", bgColor: "bg-purple-100 dark:bg-purple-950", label: "ha preso un libro in prestito" },
  PRESTITO_RESTITUITO: { iconName: "CheckCircle2", color: "text-green-600 dark:text-green-400", bgColor: "bg-green-100 dark:bg-green-950", label: "ha restituito un libro" },
  OVERRIDE_BIBLIOTECARIO: { iconName: "Shield", color: "text-orange-600 dark:text-orange-400", bgColor: "bg-orange-100 dark:bg-orange-950", label: "intervento manuale del bibliotecario" },
  AUTOMATION: { iconName: "Activity", color: "text-muted-foreground", bgColor: "bg-muted", label: "automazione di sistema" },
  CODA_INGRESSO: { iconName: "Users", color: "text-sky-600 dark:text-sky-400", bgColor: "bg-sky-100 dark:bg-sky-950", label: "utente entrato in lista d'attesa" },
  CODA_PROMOZIONE: { iconName: "Users", color: "text-sky-600 dark:text-sky-400", bgColor: "bg-sky-100 dark:bg-sky-950", label: "utente promosso dalla lista d'attesa" },
  CODA_SCADENZA: { iconName: "Clock", color: "text-yellow-600 dark:text-yellow-400", bgColor: "bg-yellow-100 dark:bg-yellow-950", label: "promozione scaduta senza conferma" },
  CODA_ANNULLATA: { iconName: "Users", color: "text-muted-foreground", bgColor: "bg-muted", label: "rimosso dalla lista d'attesa" },
};

export const metadata: Metadata = {
  title: "Dashboard amministrazione",
};

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

  const results = await Promise.all([
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
    db.posto.count({
      where: {
        stato: "MANUTENZIONE",
      },
    }),
    db.prestito.count({
      where: {
        dataRestituzione: null,
        dataScadenza: {
          lte: domani, // In scadenza entro domani
        }
      },
    }),
    db.richiestaPreparazione.count({
      where: {
        stato: "PENDENTE",
      }
    }),
    // Ultimi eventi per la card "Attività Recente": prima era un array
    // scritto a mano (Mario Rossi, Laura Bianchi, ...), sempre uguale a ogni
    // caricamento e scollegato dal database.
    db.logEvento.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        user: { select: { nome: true, cognome: true } },
      },
    }),
  ]);

  const [
    totaleUtenti,
    totalePosti,
    prenotazioniOggi,
    prenotazioniCheckIn,
    prestitiAttivi,
    noShowRecentiTutti,
    postiDisponibili,
    postiManutenzione,
    prestitiInScadenza,
    richiestePendenti,
    eventiRecenti,
  ] = results;

  // Filtra solo NO_SHOW non risolti
  const noShowRecenti = noShowRecentiTutti.filter((evento) => {
    const dettagli = evento.dettagli as { risolto?: boolean } | null;
    return !dettagli?.risolto;
  }).length;

  const tassoOccupazione = ((totalePosti - postiDisponibili) / totalePosti) * 100;

  // I trend ("+12%", "-3%", ...) erano percentuali fisse scritte a mano,
  // identiche indipendentemente dai dati reali: non c'e' ancora uno storico
  // con cui calcolare una variazione vera, quindi niente numero inventato
  // (vedi le istruzioni del task su "dati scritti a mano che fingono di
  // essere reali"). Restano solo titolo/valore/descrizione, tutti reali.
  const stats = [
    {
      title: "Prenotazioni Attive",
      value: prenotazioniCheckIn,
      description: `${prenotazioniOggi} ${prenotazioniOggi === 1 ? "prenotazione" : "prenotazioni"} oggi`,
      icon: Calendar,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-950",
    },
    {
      title: "Utenti Totali",
      value: totaleUtenti,
      description: "Studenti registrati",
      icon: Users,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-950",
    },
    {
      title: "Occupazione Posti",
      value: `${Math.round(tassoOccupazione)}%`,
      description: `${totalePosti - postiDisponibili}/${totalePosti} occupati`,
      icon: MapPin,
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-100 dark:bg-orange-950",
    },
    {
      title: "Prestiti Attivi",
      value: prestitiAttivi,
      description: "Libri in prestito",
      icon: BookOpen,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-950",
    },
  ];

  const recentActivity = eventiRecenti.map((evento) => {
    const meta = METADATA_EVENTO[evento.tipo] ?? {
      iconName: "Activity",
      color: "text-muted-foreground",
      bgColor: "bg-muted",
      label: "evento di sistema",
    };
    return {
      tipo: evento.tipo,
      utente: evento.user ? `${evento.user.nome} ${evento.user.cognome}` : "Sistema",
      azione: evento.descrizione ?? meta.label,
      tempo: formattaTempoRelativo(evento.createdAt),
      iconName: meta.iconName,
      color: meta.color,
      bgColor: meta.bgColor,
    };
  });

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
                    className={`flex items-center gap-1 text-xs font-medium ${stat.trendUp ? "text-green-600" : "text-red-600"
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

        {/* Widget Richieste Click & Collect */}
        <RichiesteCard richiestePendenti={richiestePendenti} />

        {/* Anomalie e Alert */}
        <DashboardAnomalieCard
          noShowRecenti={noShowRecenti}
          postiManutenzione={postiManutenzione}
          prestitiInScadenza={prestitiInScadenza}
        />
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
