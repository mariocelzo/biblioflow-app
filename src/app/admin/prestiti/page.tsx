import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import PrestitiFiltri from "@/components/admin/prestiti-filtri";
import PrestitiActions from "@/components/admin/prestiti-actions";
import { BookOpen, Calendar, User, AlertCircle } from "lucide-react";
import type { StatoPrestito } from "@prisma/client";

type SearchParams = {
  stato?: string;
  scadenza?: string;
  utente?: string;
};

export default async function PrestitiAdminPage({
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
    stato?: StatoPrestito;
    dataScadenza?: { lte: Date };
    OR?: Array<{
      user: {
        nome?: { contains: string; mode: "insensitive" };
        cognome?: { contains: string; mode: "insensitive" };
        email?: { contains: string; mode: "insensitive" };
      };
    }>;
  };

  const where: WhereInput = {};

  if (searchParams.stato && searchParams.stato !== "tutti") {
    where.stato = searchParams.stato as StatoPrestito;
  }

  if (searchParams.scadenza === "scaduti") {
    where.dataScadenza = { lte: new Date() };
    where.stato = "ATTIVO";
  }

  if (searchParams.utente) {
    where.OR = [
      { user: { nome: { contains: searchParams.utente, mode: "insensitive" } } },
      { user: { cognome: { contains: searchParams.utente, mode: "insensitive" } } },
      { user: { email: { contains: searchParams.utente, mode: "insensitive" } } },
    ];
  }

  // Fetch prestiti
  const prestiti = await prisma.prestito.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          nome: true,
          cognome: true,
          email: true,
        }
      },
      libro: true
    },
    orderBy: [
      { dataScadenza: "asc" }
    ],
    take: 100
  });

  // Calcola giorni di ritardo per ogni prestito
  const prestitiConRitardo = prestiti.map(prestito => {
    const oggi = new Date();
    const scadenza = new Date(prestito.dataScadenza);
    const giorniRitardo = Math.floor((oggi.getTime() - scadenza.getTime()) / (1000 * 60 * 60 * 24));
    return {
      ...prestito,
      giorniRitardo: Math.max(0, giorniRitardo),
      isScaduto: giorniRitardo > 0 && prestito.stato !== "RESTITUITO"
    };
  });

  // Statistics
  const oggi = new Date();
  const stats = {
    totali: prestiti.length,
    attivi: prestiti.filter(p => p.stato === "ATTIVO").length,
    scaduti: prestiti.filter(p => {
      const scadenza = new Date(p.dataScadenza);
      return p.stato === "ATTIVO" && scadenza < oggi;
    }).length,
    restituiti: prestiti.filter(p => p.stato === "RESTITUITO").length,
  };

  // Prestiti da sollecitare (scaduti da più di 3 giorni)
  const prestitiDaSollecitare = prestitiConRitardo.filter(p => p.giorniRitardo > 3 && p.stato === "ATTIVO");

  function getStatoBadge(stato: string, isScaduto: boolean) {
    if (isScaduto && stato === "ATTIVO") {
      return <Badge variant="destructive">Scaduto</Badge>;
    }
    
    switch (stato) {
      case "ATTIVO":
        return <Badge className="bg-blue-500">Attivo</Badge>;
      case "RESTITUITO":
        return <Badge className="bg-green-500">Restituito</Badge>;
      case "RINNOVATO":
        return <Badge className="bg-purple-500">Rinnovato</Badge>;
      case "SCADUTO":
        return <Badge variant="destructive">Scaduto</Badge>;
      default:
        return <Badge variant="secondary">{stato}</Badge>;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestione Prestiti</h1>
          <p className="text-muted-foreground">
            Visualizza e gestisci tutti i prestiti di libri
          </p>
        </div>
        
        {prestitiDaSollecitare.length > 0 && (
          <form action="/api/admin/prestiti" method="POST">
            <Button variant="outline" className="gap-2">
              <AlertCircle className="h-4 w-4" />
              Sollecita Tutti ({prestitiDaSollecitare.length})
            </Button>
          </form>
        )}
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
            <CardTitle className="text-sm font-medium">Attivi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.attivi}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Scaduti</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.scaduti}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Restituiti</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.restituiti}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <PrestitiFiltri />

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Prestiti ({prestiti.length})</CardTitle>
          <CardDescription>
            Lista completa dei prestiti con possibilità di filtraggio
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utente</TableHead>
                <TableHead>Libro</TableHead>
                <TableHead>Data Prestito</TableHead>
                <TableHead>Scadenza</TableHead>
                <TableHead>Ritardo</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prestitiConRitardo.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nessun prestito trovato
                  </TableCell>
                </TableRow>
              ) : (
                prestitiConRitardo.map((prestito) => (
                  <TableRow 
                    key={prestito.id}
                    className={prestito.isScaduto ? "bg-red-50 dark:bg-red-950/20" : ""}
                  >
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <div>
                          <div className="font-medium">
                            {prestito.user.nome} {prestito.user.cognome}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {prestito.user.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <BookOpen className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <div>
                          <div className="font-medium">
                            {prestito.libro.titolo}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {prestito.libro.autore}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {prestito.dataPrestito.toLocaleDateString('it-IT')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {prestito.dataScadenza.toLocaleDateString('it-IT')}
                      </div>
                    </TableCell>
                    <TableCell>
                      {prestito.giorniRitardo > 0 ? (
                        <Badge variant="destructive">
                          {prestito.giorniRitardo} giorni
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStatoBadge(prestito.stato, prestito.isScaduto)}
                    </TableCell>
                    <TableCell className="text-right">
                      <PrestitiActions prestito={prestito} />
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
