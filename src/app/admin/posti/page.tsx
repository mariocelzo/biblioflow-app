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
  MapPin,
  Check,
  X,
  Wrench,
  Search,
  Filter,
  Plus,
  Zap,
  Sun,
  Accessibility,
} from "lucide-react";
import db from "@/lib/prisma";
import { PostoActionButton } from "@/components/admin/posti-actions";

export default async function AdminPostiPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.ruolo !== "BIBLIOTECARIO" && session.user.ruolo !== "ADMIN") {
    redirect("/");
  }

  // Fetch posti con sala info
  const posti = await db.posto.findMany({
    include: {
      sala: {
        select: {
          nome: true,
          piano: true,
        },
      },
      _count: {
        select: {
          prenotazioni: true,
        },
      },
    },
    orderBy: [{ sala: { nome: "asc" } }, { numero: "asc" }],
  });

  // Statistiche rapide
  const stats = {
    totale: posti.length,
    disponibili: posti.filter((p) => p.stato === "DISPONIBILE").length,
    occupati: posti.filter((p) => p.stato === "OCCUPATO").length,
    manutenzione: posti.filter((p) => p.stato === "MANUTENZIONE").length,
  };

  const getStatoBadge = (stato: string) => {
    switch (stato) {
      case "DISPONIBILE":
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
            <Check className="h-3 w-3 mr-1" />
            Disponibile
          </Badge>
        );
      case "OCCUPATO":
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            <MapPin className="h-3 w-3 mr-1" />
            Occupato
          </Badge>
        );
      case "MANUTENZIONE":
        return (
          <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">
            <Wrench className="h-3 w-3 mr-1" />
            Manutenzione
          </Badge>
        );
      case "RISERVATO":
        return (
          <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
            <X className="h-3 w-3 mr-1" />
            Riservato
          </Badge>
        );
      default:
        return <Badge>{stato}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Gestione Posti</h1>
          <p className="text-muted-foreground">Visualizza e gestisci tutti i posti studio</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Aggiungi Posto
        </Button>
      </div>

      {/* Statistiche Veloci */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Totale Posti</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totale}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Disponibili</CardTitle>
            <Check className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.disponibili}</div>
            <p className="text-xs text-muted-foreground">
              {Math.round((stats.disponibili / stats.totale) * 100)}% del totale
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Occupati</CardTitle>
            <MapPin className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.occupati}</div>
            <p className="text-xs text-muted-foreground">
              {Math.round((stats.occupati / stats.totale) * 100)}% del totale
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Manutenzione</CardTitle>
            <Wrench className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.manutenzione}</div>
            <p className="text-xs text-muted-foreground">Richiede attenzione</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtri */}
      <Card>
        <CardHeader>
          <CardTitle>Filtri di Ricerca</CardTitle>
          <CardDescription>Filtra i posti per sala, stato o caratteristiche</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Cerca per numero</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Es: A-12, B-05..." className="pl-10" />
              </div>
            </div>

            <div className="md:w-48">
              <label className="text-sm font-medium mb-2 block">Sala</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Tutte le sale" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le sale</SelectItem>
                  <SelectItem value="silente">Sala Silenziosa</SelectItem>
                  <SelectItem value="gruppi">Sala Gruppi</SelectItem>
                  <SelectItem value="studio">Sala Studio</SelectItem>
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
                  <SelectItem value="DISPONIBILE">Disponibile</SelectItem>
                  <SelectItem value="OCCUPATO">Occupato</SelectItem>
                  <SelectItem value="MANUTENZIONE">Manutenzione</SelectItem>
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

      {/* Tabella Posti */}
      <Card>
        <CardHeader>
          <CardTitle>Elenco Posti ({posti.length})</CardTitle>
          <CardDescription>Tutti i posti studio della biblioteca</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numero</TableHead>
                <TableHead>Sala</TableHead>
                <TableHead>Piano</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Caratteristiche</TableHead>
                <TableHead>Prenotazioni</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posti.slice(0, 20).map((posto) => (
                <TableRow key={posto.id}>
                  <TableCell className="font-medium">{posto.numero}</TableCell>
                  <TableCell>{posto.sala.nome}</TableCell>
                  <TableCell>Piano {posto.sala.piano}</TableCell>
                  <TableCell>{getStatoBadge(posto.stato)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {posto.haPresaElettrica && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Zap className="h-3 w-3" />
                          Presa
                        </Badge>
                      )}
                      {posto.haFinestra && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Sun className="h-3 w-3" />
                          Finestra
                        </Badge>
                      )}
                      {posto.isAccessibile && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Accessibility className="h-3 w-3" />
                          Accessibile
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {posto._count.prenotazioni} totali
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <PostoActionButton
                      postoId={posto.id}
                      numero={posto.numero}
                      stato={posto.stato}
                      sala={posto.sala.nome}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {posti.length > 20 && (
            <div className="mt-4 text-center">
              <Button variant="outline">Carica altri posti ({posti.length - 20})</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
