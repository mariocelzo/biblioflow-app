"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, Accessibility, CheckCircle2, Users, Loader2 } from "lucide-react";
import {
    useIngressoCoda,
    isPostoAccodabile,
    etichettaPosto,
    ETICHETTE_CODA,
    type IntervalloCoda,
} from "@/hooks/use-ingresso-coda";

// Ri-esporto le etichette condivise: permette ai test (e a qualunque consumer)
// di verificare che la vista mobile e la mappa usino LA STESSA fonte di copy
// (AC BIB-53: "Nessuna divergenza di etichette fra le due viste").
export { etichettaPosto, ETICHETTE_CODA };

interface Posto {
    id: string;
    numero: string;
    stato: 'DISPONIBILE' | 'OCCUPATO' | 'PRENOTATO' | 'MANUTENZIONE';
    caratteristiche: {
        presaElettrica: boolean;
        accessibile: boolean;
    };
}

interface MobilePostiGridProps {
    posti: Posto[];
    postoSelezionato: string | null;
    onSelectPosto: (postoId: string) => void;
    sala: string;
    /**
     * Intervallo (data + fascia oraria) selezionato: necessario per proporre e
     * verificare l'ingresso in lista d'attesa, esattamente come nella mappa (BIB-53).
     */
    intervalloCoda: IntervalloCoda;
}

export function MobilePostiGrid({
    posti,
    postoSelezionato,
    onSelectPosto,
    sala,
    intervalloCoda,
}: MobilePostiGridProps) {

    // Stessa logica "lista d'attesa" della mappa (BIB-52), ora condivisa via hook.
    const {
        postoCoda,
        setPostoCoda,
        posizioniCoda,
        codaLoading,
        caricaPosizioneCoda,
        handleEntraInCoda,
    } = useIngressoCoda(intervalloCoda);

    const getStatusColor = (stato: Posto['stato'], isSelected: boolean) => {
        if (isSelected) return 'border-blue-500 bg-blue-50 dark:bg-blue-950';
        switch (stato) {
            case 'DISPONIBILE': return 'border-green-500 bg-white dark:bg-gray-900';
            case 'OCCUPATO': return 'border-red-400 bg-red-50 dark:bg-red-950 opacity-60';
            case 'PRENOTATO': return 'border-amber-400 bg-amber-50 dark:bg-amber-950 opacity-60';
            case 'MANUTENZIONE': return 'border-gray-400 bg-gray-100 dark:bg-gray-800 opacity-60';
        }
    };

    const getStatusLabel = (stato: Posto['stato']) => {
        switch (stato) {
            case 'DISPONIBILE': return 'Disponibile';
            case 'OCCUPATO': return 'Occupato';
            case 'PRENOTATO': return 'Prenotato';
            case 'MANUTENZIONE': return 'Manutenzione';
        }
    };

    // Click su un posto: replica 1:1 di `handlePostoClick` della mappa.
    // - DISPONIBILE -> selezione classica (e chiude l'eventuale pannello coda);
    // - OCCUPATO/PRENOTATO -> apre il pannello coda e carica la posizione;
    // - MANUTENZIONE -> nessuna azione (il bottone è disabilitato).
    const handlePostoClick = (posto: Posto) => {
        if (posto.stato === 'DISPONIBILE') {
            setPostoCoda(null);
            onSelectPosto(posto.id);
        } else if (isPostoAccodabile(posto)) {
            setPostoCoda(posto);
            void caricaPosizioneCoda(posto);
        }
    };

    const postiDisponibili = posti.filter(p => p.stato === 'DISPONIBILE');

    return (
        <div className="space-y-4">
            {/* Header Info */}
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between">
                    <span className="font-medium">{sala}</span>
                    <Badge variant="secondary">{postiDisponibili.length} disponibili</Badge>
                </div>
            </div>

            {/* Legend — stesse voci della mappa, inclusa "Coda disponibile" (BIB-53) */}
            <div className="flex flex-wrap gap-2 text-xs px-1">
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-muted-foreground">Disponibile</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-muted-foreground">Prenotato</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-muted-foreground">Occupato</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">+</div>
                    <span className="text-muted-foreground">{ETICHETTE_CODA.legenda}</span>
                </div>
            </div>

            {/* Seats Grid */}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {posti.map((posto) => {
                    const isSelected = posto.id === postoSelezionato;
                    // Un posto occupato/prenotato non è più "disabled": diventa un
                    // bottone accodabile come nella mappa. Solo MANUTENZIONE resta
                    // non selezionabile.
                    const accodabile = isPostoAccodabile(posto);
                    const isDisabled = posto.stato === 'MANUTENZIONE';
                    const isCodaAperta = postoCoda?.id === posto.id;

                    return (
                        <button
                            key={posto.id}
                            onClick={() => handlePostoClick(posto)}
                            disabled={isDisabled}
                            // Stessa identica stringa usata dalla mappa come tooltip/aria-label.
                            aria-label={etichettaPosto(posto)}
                            className={`
                relative p-3 rounded-lg border-2 transition-all
                ${getStatusColor(posto.stato, isSelected)}
                ${!isDisabled ? 'active:scale-95 hover:shadow-md' : 'cursor-not-allowed'}
                ${isSelected || isCodaAperta ? 'ring-2 ring-blue-400 ring-offset-2 shadow-lg' : ''}
                min-h-[72px] flex flex-col items-center justify-center gap-1
              `}
                        >
                            {/* Selected Check */}
                            {isSelected && (
                                <CheckCircle2 className="absolute top-1 right-1 h-4 w-4 text-blue-600" />
                            )}

                            {/* Badge "+" coda: stessa iconografia della mappa (cerchio blu con "+") */}
                            {accodabile && (
                                <span
                                    className="absolute top-1 right-1 h-4 w-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center"
                                    aria-hidden="true"
                                >
                                    +
                                </span>
                            )}

                            {/* Seat Number */}
                            <div className={`text-lg font-bold ${isDisabled ? 'text-muted-foreground' : 'text-foreground'}`}>
                                {posto.numero}
                            </div>

                            {/* Status Badge (only for non-available) */}
                            {posto.stato !== 'DISPONIBILE' && (
                                <div className="text-[10px] text-muted-foreground">
                                    {getStatusLabel(posto.stato)}
                                </div>
                            )}

                            {/* Features Icons */}
                            {posto.stato === 'DISPONIBILE' && (
                                <div className="flex gap-1 mt-1">
                                    {posto.caratteristiche.presaElettrica && (
                                        <div className="bg-amber-100 dark:bg-amber-900 rounded-full p-0.5">
                                            <Zap className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                        </div>
                                    )}
                                    {posto.caratteristiche.accessibile && (
                                        <div className="bg-blue-100 dark:bg-blue-900 rounded-full p-0.5">
                                            <Accessibility className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                        </div>
                                    )}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Pannello "Lista d'attesa · Posto N": stesse identiche stringhe della mappa,
                dalla fonte condivisa `ETICHETTE_CODA` (BIB-52/BIB-53). */}
            {postoCoda && (
                <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                    <CardContent className="p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-start gap-3">
                                <Users className="mt-0.5 h-5 w-5 text-blue-600" aria-hidden="true" />
                                <div>
                                    <h4 className="font-semibold">{ETICHETTE_CODA.titoloPannello(postoCoda.numero)}</h4>
                                    <p className="text-sm text-muted-foreground">
                                        {posizioniCoda[postoCoda.id]
                                            ? ETICHETTE_CODA.descrizioneInCoda(posizioniCoda[postoCoda.id])
                                            : ETICHETTE_CODA.descrizioneLibera}
                                    </p>
                                </div>
                            </div>
                            {posizioniCoda[postoCoda.id] ? (
                                <Badge variant="secondary" aria-label={ETICHETTE_CODA.ariaPosizione(posizioniCoda[postoCoda.id])}>
                                    {ETICHETTE_CODA.badgePosizione(posizioniCoda[postoCoda.id])}
                                </Badge>
                            ) : (
                                <Button onClick={() => handleEntraInCoda(postoCoda)} disabled={codaLoading}>
                                    {codaLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Users className="mr-2 h-4 w-4" aria-hidden="true" />}
                                    {ETICHETTE_CODA.azioneEntra}
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* No seats message */}
            {posti.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                    <p>Nessun posto trovato con i filtri selezionati</p>
                </div>
            )}
        </div>
    );
}
