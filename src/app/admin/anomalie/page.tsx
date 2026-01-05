import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  Clock,
  XCircle,
  Calendar,
  User,
  MapPin,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import db from "@/lib/prisma";
import { AnomalieActions, QuickActions, RowActionButton } from "@/components/admin/anomalie-actions";

export default async function AdminAnomaliesPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.ruolo !== "BIBLIOTECARIO" && session.user.ruolo !== "ADMIN") {
    redirect("/");
  }

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const setteGiorniFa = new Date(oggi);
  setteGiorniFa.setDate(setteGiorniFa.getDate() - 7);
  const domani = new Date(oggi);
  domani.setDate(domani.getDate() + 1);

  // Fetch anomalie
  const [noShowRecentiTutti, prenotazioniScadute, prestitiScaduti, ritardiCheckIn] = await Promise.all([
    // No-show degli ultimi 7 giorni (prendi tutti per filtrare correttamente)
    db.logEvento.findMany({
      where: {
        tipo: "NO_SHOW",
        createdAt: {
          gte: setteGiorniFa,
        },
      },
      include: {
        user: {
          select: {
            nome: true,
            cognome: true,
            email: true,
            matricola: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),

    // Prenotazioni scadute (stato SCADUTA)
    db.prenotazione.findMany({
      where: {
        stato: "SCADUTA",
        data: {
          gte: setteGiorniFa,
        },
      },
      include: {
        user: {
          select: {
            nome: true,
            cognome: true,
            email: true,
            matricola: true,
          },
        },
        posto: {
          select: {
            numero: true,
            sala: {
              select: {
                nome: true,
              },
            },
          },
        },
      },
      orderBy: {
        data: "desc",
      },
      take: 10,
    }),

    // Prestiti scaduti
    db.prestito.findMany({
      where: {
        stato: "SCADUTO",
      },
      include: {
        user: {
          select: {
            nome: true,
            cognome: true,
            email: true,
            matricola: true,
          },
        },
        libro: {
          select: {
            titolo: true,
            autore: true,
          },
        },
      },
      orderBy: {
        dataScadenza: "asc",
      },
      take: 10,
    }),

    // Prenotazioni con check-in mai fatto (CONFERMATA da oltre 1 ora dall'inizio)
    db.prenotazione.findMany({
      where: {
        stato: "CONFERMATA",
        data: oggi,
      },
      include: {
        user: {
          select: {
            nome: true,
            cognome: true,
            email: true,
            matricola: true,
          },
        },
        posto: {
          select: {
            numero: true,
            sala: {
              select: {
                nome: true,
              },
            },
          },
        },
      },
      orderBy: {
        oraInizio: "asc",
      },
      take: 10,
    }),
  ]);

  // Filtra solo NO_SHOW non risolti
  const noShowRecenti = noShowRecentiTutti.filter((evento) => {
    const dettagli = evento.dettagli as { risolto?: boolean } | null;
    return !dettagli?.risolto;
  });

  // Limita la visualizzazione ai primi 20 per la tabella
  const noShowPerTabella = noShowRecenti.slice(0, 20);

  // Statistiche
  const stats = {
    noShow: noShowRecenti.length,
    prenotazioniScadute: prenotazioniScadute.length,
    prestitiScaduti: prestitiScaduti.length,
    ritardiCheckIn: ritardiCheckIn.length,
    totaleAnomalieAttive: noShowRecenti.length + prenotazioniScadute.length + prestitiScaduti.length + ritardiCheckIn.length,
  };

  const formatDateTime = (date: Date) => {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(date));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-orange-600" />
            Anomalie & Alert
          </h1>
          <p className="text-muted-foreground">
            Monitora e gestisci le anomalie del sistema
          </p>
        </div>
        <AnomalieActions stats={stats} />
      </div>

      {/* Statistiche Anomalie */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Totale Attive</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.totaleAnomalieAttive}</div>
            <p className="text-xs text-muted-foreground">Richiedono attenzione</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">No-Show</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.noShow}</div>
            <p className="text-xs text-muted-foreground">Ultimi 7 giorni</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Prenotazioni</CardTitle>
            <Calendar className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {stats.prenotazioniScadute}
            </div>
            <p className="text-xs text-muted-foreground">Scadute senza check-in</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Prestiti</CardTitle>
            <BookOpen className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.prestitiScaduti}</div>
            <p className="text-xs text-muted-foreground">Oltre la scadenza</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Ritardi</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.ritardiCheckIn}</div>
            <p className="text-xs text-muted-foreground">Check-in mancanti</p>
          </CardContent>
        </Card>
      </div>

      {/* Azioni Rapide */}
      <Card>
        <CardHeader>
          <CardTitle>Azioni Rapide</CardTitle>
          <CardDescription>
            Esegui azioni in batch per risolvere più anomalie contemporaneamente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QuickActions stats={stats} />
        </CardContent>
      </Card>

      {/* No-Show Recenti */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                No-Show Recenti
              </CardTitle>
              <CardDescription>
                Utenti che non si sono presentati alle prenotazioni
              </CardDescription>
            </div>
            <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
              {stats.noShow} eventi
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {noShowPerTabella.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utente</TableHead>
                  <TableHead>Data/Ora</TableHead>
                  <TableHead>Dettagli</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {noShowPerTabella.map((evento) => (
                  <TableRow key={evento.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {evento.user?.nome} {evento.user?.cognome}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {evento.user?.matricola ? `Mat. ${evento.user.matricola}` : evento.user?.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(evento.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {typeof evento.dettagli === 'string' ? evento.dettagli : 'No-show rilevato'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <RowActionButton
                          azione="AVVISA_UTENTE"
                          label="Avvisa"
                          userId={evento.userId ?? undefined}
                          className="text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-600" />
              <p>Nessun no-show registrato negli ultimi 7 giorni</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prestiti Scaduti */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-red-600" />
                Prestiti Scaduti
              </CardTitle>
              <CardDescription>Libri non restituiti oltre la scadenza</CardDescription>
            </div>
            <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
              {stats.prestitiScaduti} prestiti
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {prestitiScaduti.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utente</TableHead>
                  <TableHead>Libro</TableHead>
                  <TableHead>Scadenza</TableHead>
                  <TableHead>Ritardo</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prestitiScaduti.map((prestito) => {
                  const giorniRitardo = Math.floor(
                    (oggi.getTime() - new Date(prestito.dataScadenza).getTime()) /
                      (1000 * 60 * 60 * 24)
                  );
                  return (
                    <TableRow key={prestito.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {prestito.user.nome} {prestito.user.cognome}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {prestito.user.email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{prestito.libro.titolo}</span>
                          <span className="text-xs text-muted-foreground">
                            {prestito.libro.autore}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(prestito.dataScadenza)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="destructive"
                          className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                        >
                          {giorniRitardo} {giorniRitardo === 1 ? "giorno" : "giorni"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <RowActionButton
                            azione="AVVISA_UTENTE"
                            label="Sollecita"
                            userId={prestito.userId}
                            className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-600" />
              <p>Nessun prestito in ritardo</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prenotazioni con Check-in Mancante */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                Check-in Mancanti (Oggi)
              </CardTitle>
              <CardDescription>
                Prenotazioni confermate senza check-in effettuato
              </CardDescription>
            </div>
            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
              {stats.ritardiCheckIn} prenotazioni
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {ritardiCheckIn.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utente</TableHead>
                  <TableHead>Posto</TableHead>
                  <TableHead>Orario</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ritardiCheckIn.map((prenotazione) => (
                  <TableRow key={prenotazione.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {prenotazione.user.nome} {prenotazione.user.cognome}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Mat. {prenotazione.user.matricola}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {prenotazione.posto.sala.nome} - {prenotazione.posto.numero}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span className="text-sm">
                          {new Date(prenotazione.oraInizio).toLocaleTimeString("it-IT", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          -{" "}
                          {new Date(prenotazione.oraFine).toLocaleTimeString("it-IT", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <RowActionButton
                          azione="AVVISA_UTENTE"
                          label="Avvisa"
                          userId={prenotazione.userId}
                          className="text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-600" />
              <p>Tutti gli utenti hanno effettuato il check-in</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Azioni Automatiche */}
      <Card>
        <CardHeader>
          <CardTitle>Azioni Correttive Automatiche</CardTitle>
          <CardDescription>
            Configura le azioni automatiche per gestire le anomalie
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <h4 className="font-medium">Alert automatico no-show</h4>
                <p className="text-sm text-muted-foreground">
                  Invia notifica automatica dopo 2 no-show in 30 giorni
                </p>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                Attivo
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <h4 className="font-medium">Sollecito prestiti scaduti</h4>
                <p className="text-sm text-muted-foreground">
                  Email automatica 1 giorno prima e il giorno della scadenza
                </p>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                Attivo
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <h4 className="font-medium">Cancellazione prenotazioni senza check-in</h4>
                <p className="text-sm text-muted-foreground">
                  Annulla automaticamente dopo 15 minuti dall&apos;inizio
                </p>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                Attivo
              </Badge>
            </div>

            <Separator />

            <Button variant="outline" className="w-full">
              Configura Azioni Automatiche
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
