"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Accessibility, CheckCircle2 } from "lucide-react";

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
}

export function MobilePostiGrid({
    posti,
    postoSelezionato,
    onSelectPosto,
    sala,
}: MobilePostiGridProps) {

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

            {/* Legend */}
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
            </div>

            {/* Seats Grid */}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {posti.map((posto) => {
                    const isSelected = posto.id === postoSelezionato;
                    const isDisabled = posto.stato !== 'DISPONIBILE';

                    return (
                        <button
                            key={posto.id}
                            onClick={() => !isDisabled && onSelectPosto(posto.id)}
                            disabled={isDisabled}
                            className={`
                relative p-3 rounded-lg border-2 transition-all
                ${getStatusColor(posto.stato, isSelected)}
                ${!isDisabled ? 'active:scale-95 hover:shadow-md' : 'cursor-not-allowed'}
                ${isSelected ? 'ring-2 ring-blue-400 ring-offset-2 shadow-lg' : ''}
                min-h-[72px] flex flex-col items-center justify-center gap-1
              `}
                        >
                            {/* Selected Check */}
                            {isSelected && (
                                <CheckCircle2 className="absolute top-1 right-1 h-4 w-4 text-blue-600" />
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
                            {!isDisabled && (
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

            {/* No seats message */}
            {posti.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                    <p>Nessun posto trovato con i filtri selezionati</p>
                </div>
            )}
        </div>
    );
}
