import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Search,
  Filter,
  UserCheck,
  UserX,
  Shield,
  GraduationCap,
  Calendar,
  BookOpen,
  Mail,
  Clock,
} from "lucide-react";
import db from "@/lib/prisma";
import { UtenteActionButton } from "@/components/admin/utenti-actions";

export default async function AdminUtentiPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.ruolo !== "BIBLIOTECARIO" && session.user.ruolo !== "ADMIN") {
    redirect("/");
  }

  // Fetch utenti con statistiche
  const utenti = await db.user.findMany({
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
  });

  // Statistiche rapide
  const stats = {
    totale: utenti.length,
    studenti: utenti.filter((u) => u.ruolo === "STUDENTE").length,
    staff: utenti.filter((u) => u.ruolo === "BIBLIOTECARIO" || u.ruolo === "ADMIN").length,
    attivi: utenti.filter((u) => u.attivo).length,
    disattivati: utenti.filter((u) => !u.attivo).length,
    emailVerificate: utenti.filter((u) => u.emailVerificata).length,
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
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Gestione Utenti
          </h1>
          <p className="text-muted-foreground">
            Visualizza e gestisci tutti gli utenti della biblioteca
          </p>
        </div>
        <Button className="gap-2">
          <Users className="h-4 w-4" />
          Esporta Lista
        </Button>
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

      {/* Filtri */}
      <Card>
        <CardHeader>
          <CardTitle>Filtri di Ricerca</CardTitle>
          <CardDescription>Cerca e filtra utenti per nome, email o ruolo</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Cerca utente</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Nome, cognome o email..." className="pl-10" />
              </div>
            </div>

            <div className="md:w-48">
              <label className="text-sm font-medium mb-2 block">Ruolo</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Tutti i ruoli" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="STUDENTE">Studenti</SelectItem>
                  <SelectItem value="BIBLIOTECARIO">Bibliotecari</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:w-48">
              <label className="text-sm font-medium mb-2 block">Stato</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Tutti gli stati" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="attivo">Attivi</SelectItem>
                  <SelectItem value="disattivato">Disattivati</SelectItem>
                  <SelectItem value="verificato">Email verificata</SelectItem>
                  <SelectItem value="non-verificato">Email non verificata</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Applica Filtri
            </Button>
          </div>
        </CardContent>
      </Card>

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
              {utenti.slice(0, 50).map((utente) => (
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
              ))}
            </TableBody>
          </Table>

          {utenti.length > 50 && (
            <div className="mt-4 text-center">
              <Button variant="outline">
                Carica altri utenti ({utenti.length - 50})
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
