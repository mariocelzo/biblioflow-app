"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface RichiesteCardProps {
    richiestePendenti: number;
}

export function RichiesteCard({ richiestePendenti }: RichiesteCardProps) {
    const router = useRouter();

    return (
        // Prima "col-span-4" su una griglia lg:grid-cols-7 lasciava 3 colonne
        // vuote nella riga della card "Attività Recente" (4+4 supera 7 e va a
        // capo). Qui la card fa da banner a tutta larghezza sotto la coppia
        // Attività/Anomalie, che insieme riempiono esattamente le 7 colonne.
        <Card className="md:col-span-2 lg:col-span-7">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-blue-600" />
                    Richieste Libri
                </CardTitle>
                {/* "Click & Collect" e' il nome del servizio (usato anche in
                    /admin/richieste): solo "service status" era rimasto in
                    inglese. */}
                <CardDescription>Click & Collect — stato del servizio</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <p className="text-2xl font-bold">{richiestePendenti}</p>
                        <p className="text-sm text-muted-foreground">Richieste in attesa di preparazione</p>
                    </div>
                    <Button onClick={() => router.push("/admin/richieste")}>
                        Gestisci <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
