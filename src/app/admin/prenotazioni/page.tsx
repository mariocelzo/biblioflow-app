import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PrenotazioniFiltri from "@/components/admin/prenotazioni-filtri";
import PrenotazioniActions from "@/components/admin/prenotazioni-actions";
import { Calendar, Clock, MapPin, User } from "lucide-react";
import type { StatoPrenotazione } from "@prisma/client";

type SearchParams = {
  stato?: string;
  data?: string;
  utente?: string;
};

export default async function PrenotazioniAdminPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();

  if (!session?.user || (session.user.ruolo !== "ADMIN" && session.user.ruolo !== "BIBLIOTECARIO")) {
    redirect("/login");
  }

  // Build where clause
  type WhereInput = {
    stato?: StatoPrenotazione;
    data?: Date;
    OR?: Array<{
      user: {
        nome?: { contains: string; mode: "insensitive" };
        cognome?: { contains: string; mode: "insensitive" };
        email?: { contains: string; mode: "insensitive" };
        matricola?: { contains: string; mode: "insensitive" };
      };
    }>;
  };

  const where: WhereInput = {};

  if (searchParams.stato && searchParams.stato !== "tutti") {
    where.stato = searchParams.stato as StatoPrenotazione;
  }

  if (searchParams.data) {
    const dataSelezionata = new Date(searchParams.data);
    where.data = dataSelezionata;
  }

  if (searchParams.utente) {
    where.OR = [
      { user: { nome: { contains: searchParams.utente, mode: "insensitive" } } },
      { user: { cognome: { contains: searchParams.utente, mode: "insensitive" } } },
      { user: { email: { contains: searchParams.utente, mode: "insensitive" } } },
      { user: { matricola: { contains: searchParams.utente, mode: "insensitive" } } },
    ];
  }

  // Fetch prenotazioni
  const prenotazioni = await prisma.prenotazione.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          nome: true,
          cognome: true,
          email: true,
          matricola: true,
        }
      },
      posto: {
        include: {
          sala: true
        }
      }
    },
    orderBy: [
      { data: "desc" },
      { oraInizio: "desc" }
    ],
    take: 100
  });

  // Statistics
  const stats = {
    totali: prenotazioni.length,
    attive: prenotazioni.filter(p => p.stato === "CONFERMATA").length,
    completate: prenotazioni.filter(p => p.stato === "COMPLETATA").length,
    cancellate: prenotazioni.filter(p => p.stato === "CANCELLATA").length,
  };

  function getStatoBadge(stato: string) {
    switch (stato) {
      case "CONFERMATA":
        return <Badge variant="default">Confermata</Badge>;
      case "CHECK_IN":
        return <Badge className="bg-blue-500">Check-in</Badge>;
      case "COMPLETATA":
        return <Badge className="bg-green-500">Completata</Badge>;
      case "CANCELLATA":
        return <Badge variant="destructive">Cancellata</Badge>;
      case "NO_SHOW":
        return <Badge variant="destructive">No-show</Badge>;
      case "SCADUTA":
        return <Badge variant="outline">Scaduta</Badge>;
      default:
        return <Badge variant="secondary">{stato}</Badge>;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gestione Prenotazioni</h1>
        <p className="text-muted-foreground">
          Visualizza e gestisci tutte le prenotazioni della biblioteca
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Totali</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totali}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Attive</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.attive}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Completate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completate}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Cancellate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.cancellate}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <PrenotazioniFiltri />

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Prenotazioni ({prenotazioni.length})</CardTitle>
          <CardDescription>
            Lista completa delle prenotazioni con possibilità di filtraggio
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utente</TableHead>
                <TableHead>Posto</TableHead>
                <TableHead>Data e Ora</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prenotazioni.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nessuna prenotazione trovata
                  </TableCell>
                </TableRow>
              ) : (
                prenotazioni.map((prenotazione) => (
                  <TableRow key={prenotazione.id}>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <div>
                          <div className="font-medium">
                            {prenotazione.user.nome} {prenotazione.user.cognome}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {prenotazione.user.matricola}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <div>
                          <div className="font-medium">
                            {prenotazione.posto.sala.nome} - Posto {prenotazione.posto.numero}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Piano {prenotazione.posto.sala.piano}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-sm">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {prenotazione.data.toLocaleDateString('it-IT')}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(`1970-01-01T${prenotazione.oraInizio}`).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} - {new Date(`1970-01-01T${prenotazione.oraFine}`).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatoBadge(prenotazione.stato)}
                    </TableCell>
                    <TableCell>
                      {prenotazione.checkInAt ? (
                        <div className="text-sm text-muted-foreground">
                          {prenotazione.checkInAt.toLocaleString('it-IT', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <PrenotazioniActions prenotazione={prenotazione} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
