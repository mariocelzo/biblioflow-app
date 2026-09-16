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
  MapPin,
  Check,
  X,
  Wrench,
  Zap,
  Sun,
  Accessibility,
} from "lucide-react";
import type { Prisma, StatoPosto } from "@prisma/client";
import db from "@/lib/prisma";
import { PostoActionButton } from "@/components/admin/posti-actions";
import PostiFiltri from "@/components/admin/posti-filtri";

export const metadata: Metadata = {
  title: "Gestione posti",
};

type SearchParams = {
  numero?: string;
  sala?: string;
  stato?: string;
};

export default async function AdminPostiPage({
  searchParams,
}: {
  // Next.js 16: searchParams e' una Promise (stesso motivo del fix gia'
  // applicato a /admin/prenotazioni e /admin/prestiti).
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

  // Elenco sale reali per popolare il filtro: prima il <Select> aveva tre
  // voci scritte a mano ("Sala Silenziosa", "Sala Gruppi", "Sala Studio")
  // che non combaciavano con i nomi delle sale esistenti nel database.
  const sale = await db.sala.findMany({
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });

  const where: Prisma.PostoWhereInput = {};
  if (params.numero) {
    where.numero = { contains: params.numero, mode: "insensitive" };
  }
  if (params.sala && params.sala !== "tutte") {
    where.salaId = params.sala;
  }
  if (params.stato && params.stato !== "tutti") {
    where.stato = params.stato as StatoPosto;
  }

  // Fetch posti con sala info. Prima non c'era filtro server-side (i filtri
  // in UI non facevano nulla) e la tabella veniva tagliata a 20 righe con un
  // bottone "Carica altri" che pero' non aveva nessun gestore: qui il limite
  // e' allineato alle altre pagine admin (take: 100, vedi prenotazioni e
  // prestiti) e il filtro riduce davvero i risultati mostrati.
  const posti = await db.posto.findMany({
    where,
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
    take: 100,
  });

  // Statistiche rapide: sempre calcolate su TUTTI i posti (non sul
  // risultato filtrato), cosi' le card in alto restano stabili mentre si
  // cerca/filtra la tabella sotto.
  const [totalePosti, disponibiliPosti, occupatiPosti, manutenzionePosti] = await Promise.all([
    db.posto.count(),
    db.posto.count({ where: { stato: "DISPONIBILE" } }),
    db.posto.count({ where: { stato: "OCCUPATO" } }),
    db.posto.count({ where: { stato: "MANUTENZIONE" } }),
  ]);

  const stats = {
    totale: totalePosti,
    disponibili: disponibiliPosti,
    occupati: occupatiPosti,
    manutenzione: manutenzionePosti,
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
      {/* Header.
          PRIMA c'era un bottone "Aggiungi Posto" senza alcun gestore: un
          clic non faceva nulla. Non esiste (ancora) una API di creazione
          posti, quindi - come gia' scelto per la voce "Impostazioni" nella
          sidebar (vedi admin-sidebar.tsx) - meglio nessun bottone che uno
          che promette una funzione inesistente. */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Gestione Posti</h1>
        <p className="text-muted-foreground">Visualizza e gestisci tutti i posti studio</p>
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

      {/* Filtri: ora collegati davvero alla query (vedi posti-filtri.tsx) */}
      <PostiFiltri sale={sale} />

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
              {posti.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nessun posto trovato con questi filtri
                  </TableCell>
                </TableRow>
              ) : (
              posti.map((posto) => (
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
              ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
