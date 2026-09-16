import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  UserCheck,
  UserX,
  Shield,
  GraduationCap,
  Calendar,
  BookOpen,
  Mail,
  Clock,
} from "lucide-react";
import type { Prisma, UserRole } from "@prisma/client";
import db from "@/lib/prisma";
import { UtenteActionButton } from "@/components/admin/utenti-actions";
import UtentiFiltri from "@/components/admin/utenti-filtri";

export const metadata: Metadata = {
  title: "Gestione utenti",
};

type SearchParams = {
  q?: string;
  ruolo?: string;
  stato?: string;
};

export default async function AdminUtentiPage({
  searchParams,
}: {
  // Next.js 16: searchParams e' una Promise (stesso motivo del fix gia'
  // applicato alle altre liste admin).
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.ruolo !== "BIBLIOTECARIO" && session.user.ruolo !== "ADMIN") {
    redirect("/");
  }

  const params = await searchParams;

  const where: Prisma.UserWhereInput = {};
  if (params.q) {
    where.OR = [
      { nome: { contains: params.q, mode: "insensitive" } },
      { cognome: { contains: params.q, mode: "insensitive" } },
      { email: { contains: params.q, mode: "insensitive" } },
    ];
  }
  if (params.ruolo && params.ruolo !== "tutti") {
    where.ruolo = params.ruolo as UserRole;
  }
  if (params.stato === "attivo") where.attivo = true;
  if (params.stato === "disattivato") where.attivo = false;
  if (params.stato === "verificato") where.emailVerificata = true;
  if (params.stato === "non-verificato") where.emailVerificata = false;

  // Fetch utenti con statistiche. Prima campo di ricerca e select non
  // filtravano nulla (nessun gestore) e la tabella era tagliata a 50 righe
  // con un bottone "Carica altri" senza alcun gestore per mostrarne altre.
  const utenti = await db.user.findMany({
    where,
    include: {
      _count: {
        select: {
          prenotazioni: true,
          prestiti: true,
          notifiche: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });

  // Statistiche rapide: sempre su TUTTI gli utenti, non sul risultato
  // filtrato, cosi' le card in alto restano stabili mentre si cerca.
  const [totaleUtenti, studentiUtenti, staffUtenti, attiviUtenti, disattivatiUtenti, verificateUtenti] =
    await Promise.all([
      db.user.count(),
      db.user.count({ where: { ruolo: "STUDENTE" } }),
      db.user.count({ where: { ruolo: { in: ["BIBLIOTECARIO", "ADMIN"] } } }),
      db.user.count({ where: { attivo: true } }),
      db.user.count({ where: { attivo: false } }),
      db.user.count({ where: { emailVerificata: true } }),
    ]);

  const stats = {
    totale: totaleUtenti,
    studenti: studentiUtenti,
    staff: staffUtenti,
    attivi: attiviUtenti,
    disattivati: disattivatiUtenti,
    emailVerificate: verificateUtenti,
  };

  const getRuoloBadge = (ruolo: string) => {
    switch (ruolo) {
      case "STUDENTE":
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            <GraduationCap className="h-3 w-3 mr-1" />
            Studente
          </Badge>
        );
      case "BIBLIOTECARIO":
        return (
          <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
            <BookOpen className="h-3 w-3 mr-1" />
            Bibliotecario
          </Badge>
        );
      case "ADMIN":
        return (
          <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">
            <Shield className="h-3 w-3 mr-1" />
            Admin
          </Badge>
        );
      default:
        return <Badge>{ruolo}</Badge>;
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "Mai";
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  };

  return (
    <div className="space-y-6">
      {/* Header.
          PRIMA c'era un bottone "Esporta Lista" senza alcun gestore: nessuna
          API genera un export, quindi (come per "Aggiungi Posto" in
          /admin/posti) e' stato tolto invece di lasciarlo li' a non fare
          nulla. */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Gestione Utenti
        </h1>
        <p className="text-muted-foreground">
          Visualizza e gestisci tutti gli utenti della biblioteca
        </p>
      </div>

      {/* Statistiche Veloci */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Totale</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totale}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Studenti</CardTitle>
            <GraduationCap className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.studenti}</div>
            <p className="text-xs text-muted-foreground">
              {Math.round((stats.studenti / stats.totale) * 100)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Staff</CardTitle>
            <Shield className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats.staff}</div>
            <p className="text-xs text-muted-foreground">Admin & Bibliotecari</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Attivi</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.attivi}</div>
            <p className="text-xs text-muted-foreground">Account abilitati</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Disattivati</CardTitle>
            <UserX className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.disattivati}</div>
            <p className="text-xs text-muted-foreground">Account disabilitati</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Verificate</CardTitle>
            <Mail className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.emailVerificate}</div>
            <p className="text-xs text-muted-foreground">Email confermate</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtri: ora collegati davvero alla query (vedi utenti-filtri.tsx) */}
      <UtentiFiltri />

      {/* Tabella Utenti */}
      <Card>
        <CardHeader>
          <CardTitle>Elenco Utenti ({utenti.length})</CardTitle>
          <CardDescription>Tutti gli utenti registrati nel sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utente</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Attività</TableHead>
                <TableHead>Ultimo Accesso</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {utenti.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nessun utente trovato con questi filtri
                  </TableCell>
                </TableRow>
              ) : (
              utenti.map((utente) => (
                <TableRow key={utente.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {utente.nome} {utente.cognome}
                      </span>
                      {utente.matricola && (
                        <span className="text-xs text-muted-foreground">
                          Mat. {utente.matricola}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{utente.email}</span>
                      {utente.emailVerificata && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Mail className="h-3 w-3 text-green-600" />
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getRuoloBadge(utente.ruolo)}</TableCell>
                  <TableCell>
                    {utente.attivo ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                        <UserCheck className="h-3 w-3 mr-1" />
                        Attivo
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                        <UserX className="h-3 w-3 mr-1" />
                        Disattivato
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {utente._count.prenotazioni}
                      </span>
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        {utente._count.prestiti}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDate(utente.ultimoAccesso)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <UtenteActionButton
                      userId={utente.id}
                      nome={utente.nome}
                      cognome={utente.cognome}
                      email={utente.email}
                      attivo={utente.attivo}
                      ruolo={utente.ruolo}
                    />
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
