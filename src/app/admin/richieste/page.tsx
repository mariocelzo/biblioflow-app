"use client";

import { useState, useEffect } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
    Loader2,
    Package,
    CheckCircle,
    XCircle,
    Clock,
    ArrowRight,
    RefreshCw,
    BoxSelect
} from "lucide-react";

interface Richiesta {
    id: string;
    user: {
        nome: string;
        cognome: string;
        matricola?: string;
        email: string;
    };
    libro: {
        titolo: string;
        autore: string;
        isbn: string;
        scaffale?: string;
        piano?: number; // o string
        copertina?: string;
    };
    stato: "PENDENTE" | "IN_LAVORAZIONE" | "PRONTA_RITIRO" | "COMPLETATA" | "RIFIUTATA" | "CANCELLATA";
    note?: string;
    createdAt: string;
}

export default function AdminRichiestePage() {
    const [richieste, setRichieste] = useState<Richiesta[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchRichieste = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/richieste");
            if (res.ok) {
                const data = await res.json();
                setRichieste(data.data);
            } else {
                toast.error("Errore nel caricamento richieste");
            }
        } catch (err) {
            console.error(err);
            toast.error("Errore di connessione");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRichieste();
    }, []);

    const updateStato = async (id: string, nuovoStato: string) => {
        setProcessingId(id);
        try {
            const res = await fetch("/api/admin/richieste", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, stato: nuovoStato }),
            });

            if (res.ok) {
                toast.success(`Stato aggiornato a ${nuovoStato}`);
                fetchRichieste(); // Refresh
            } else {
                toast.error("Errore aggiornamento stato");
            }
        } catch (error) {
            toast.error("Errore di connessione");
        } finally {
            setProcessingId(null);
        }
    };

    const getStatoBadge = (stato: string) => {
        switch (stato) {
            case "PENDENTE":
                return <Badge className="bg-yellow-500 hover:bg-yellow-600">Pendente</Badge>;
            case "IN_LAVORAZIONE":
                return <Badge className="bg-blue-500 hover:bg-blue-600">In Lav.</Badge>;
            case "PRONTA_RITIRO":
                return <Badge className="bg-green-500 hover:bg-green-600">Pronta</Badge>;
            case "COMPLETATA":
                return <Badge className="bg-gray-500">Completata</Badge>;
            case "RIFIUTATA":
                return <Badge variant="destructive">Rifiutata</Badge>;
            default:
                return <Badge variant="outline">{stato}</Badge>;
        }
    };

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Gestione Richieste Libri</h1>
                    <p className="text-muted-foreground">Click & Collect - Dashboard Operatore</p>
                </div>
                <Button onClick={fetchRichieste} variant="outline" size="icon">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-blue-600" />
                        Richieste Recenti
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Stato</TableHead>
                                <TableHead>Libro</TableHead>
                                <TableHead>Posizione</TableHead>
                                <TableHead>Utente</TableHead>
                                <TableHead>Data</TableHead>
                                <TableHead className="text-right">Azioni</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading && richieste.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        Caricamento...
                                    </TableCell>
                                </TableRow>
                            ) : richieste.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        Nessuna richiesta trovata.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                richieste.map((req) => (
                                    <TableRow key={req.id}>
                                        <TableCell>{getStatoBadge(req.stato)}</TableCell>
                                        <TableCell>
                                            <div className="font-medium">{req.libro.titolo}</div>
                                            <div className="text-xs text-muted-foreground">{req.libro.isbn}</div>
                                        </TableCell>
                                        <TableCell>
                                            {req.libro.scaffale ? (
                                                <div className="flex flex-col text-sm">
                                                    <span className="font-mono bg-slate-100 px-1 rounded inline-block w-fit">
                                                        Scaffale: {req.libro.scaffale}
                                                    </span>
                                                    {req.libro.piano && <span className="text-xs text-muted-foreground">Piano: {req.libro.piano}</span>}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground italic text-xs">N/D</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm">{req.user.nome} {req.user.cognome}</div>
                                            <div className="text-xs text-muted-foreground">{req.user.matricola || req.user.email}</div>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {new Date(req.createdAt).toLocaleString("it-IT", {
                                                day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
                                            })}
                                        </TableCell>
                                        <TableCell className="text-right space-x-2">
                                            {req.stato === "PENDENTE" && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => updateStato(req.id, "IN_LAVORAZIONE")}
                                                    disabled={processingId === req.id}
                                                >
                                                    {processingId === req.id ? <Loader2 className="animate-spin h-3 w-3" /> : "Prendi in carico"}
                                                </Button>
                                            )}
                                            {req.stato === "IN_LAVORAZIONE" && (
                                                <Button
                                                    size="sm"
                                                    className="bg-green-600 hover:bg-green-700"
                                                    onClick={() => updateStato(req.id, "PRONTA_RITIRO")}
                                                    disabled={processingId === req.id}
                                                >
                                                    {processingId === req.id ? <Loader2 className="animate-spin h-3 w-3" /> : "Pronto al Ritiro"}
                                                </Button>
                                            )}
                                            {req.stato === "PRONTA_RITIRO" && (
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => updateStato(req.id, "COMPLETATA")}
                                                    disabled={processingId === req.id}
                                                >
                                                    {processingId === req.id ? <Loader2 className="animate-spin h-3 w-3" /> : "Segna Ritirato"}
                                                </Button>
                                            )}
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
