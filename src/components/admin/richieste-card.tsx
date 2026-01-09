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
        <Card className="col-span-4">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-blue-600" />
                    Richieste Libri
                </CardTitle>
                <CardDescription>Click & Collect service status</CardDescription>
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
