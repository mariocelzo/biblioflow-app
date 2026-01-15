"use client";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Wifi,
  Zap,
  Sun,
  VolumeX,
  Accessibility,
  ZoomIn,
  ZoomOut,
  Maximize
} from "lucide-react";

export interface Posto {
  id: string;
  numero: string;
  x: number;
  y: number;
  stato: 'DISPONIBILE' | 'OCCUPATO' | 'PRENOTATO' | 'MANUTENZIONE';
  caratteristiche: {
    presaElettrica: boolean;
    finestraVicina: boolean;
    silenzioso: boolean;
    wifi: boolean;
    accessibile: boolean;
  };
}

interface MappaBibliotecaProps {
  sala: string;
  piano: number;
  posti: Posto[];
  postoSelezionato: string | null;
  onSelectPosto: (postoId: string) => void;
}

export function MappaBiblioteca({
  sala,
  piano,
  posti,
  postoSelezionato,
  onSelectPosto
}: MappaBibliotecaProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Determina quale sala in base al nome della sala (priorità) o ai posti
  const determinaSalaId = (): number => {
    const salaNormalized = sala.toLowerCase();
    if (salaNormalized.includes('studio') || salaNormalized.includes('principale')) return 1;
    if (salaNormalized.includes('silenzio') || salaNormalized.includes('lettura')) return 2;
    if (salaNormalized.includes('grupp')) return 3;

    if (posti.length === 0) return 1;

    const primoNumero = posti[0].numero;
    if (primoNumero.match(/^[A-L]/)) return 1;
    if (primoNumero.match(/^S/)) return 2;
    if (primoNumero.match(/^G/)) return 3;

    return 1;
  };

  const salaId = determinaSalaId();

  const getPostoColor = (stato: Posto['stato'], isSelected: boolean) => {
    if (isSelected) return '#3B82F6';
    switch (stato) {
      case 'DISPONIBILE': return '#10B981';
      case 'OCCUPATO': return '#EF4444';
      case 'PRENOTATO': return '#F59E0B';
      case 'MANUTENZIONE': return '#6B7280';
    }
  };

  const getPostoTooltip = (posto: Posto): string => {
    switch (posto.stato) {
      case 'DISPONIBILE': return `Posto ${posto.numero} - Disponibile (clicca per selezionare)`;
      case 'OCCUPATO': return `Posto ${posto.numero} - Già prenotato per questa fascia oraria`;
      case 'PRENOTATO': return `Posto ${posto.numero} - Prenotato`;
      case 'MANUTENZIONE': return `Posto ${posto.numero} - In manutenzione`;
      default: return `Posto ${posto.numero}`;
    }
  };

  const handlePostoClick = (posto: Posto) => {
    // Se stiamo trascinando (o abbiamo appena finito), non selezionare
    if (isDragging) return;
    if (posto.stato === 'DISPONIBILE') {
      onSelectPosto(posto.id);
    }
  };

  const zoomIn = () => setZoom(prev => Math.min(prev + 0.2, 2.5));
  const zoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.5));

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX - pan.x, y: clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    setPan({
      x: clientX - dragStart.x,
      y: clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const postiFiltrati = posti.filter(p => {
    if (salaId === 1) return p.numero.match(/^[A-L]\d+$/);
    else if (salaId === 2) return p.numero.match(/^S\d+$/);
    else if (salaId === 3) return p.numero.match(/^G\d+$/);
    return false;
  });

  const postiOrdinati = [...postiFiltrati].sort((a, b) => {
    if (salaId === 1) {
      const matchA = a.numero.match(/([A-Z])(\d+)/);
      const matchB = b.numero.match(/([A-Z])(\d+)/);
      if (!matchA || !matchB) return 0;
      const [, letteraA, numeroA] = matchA;
      const [, letteraB, numeroB] = matchB;
      if (letteraA !== letteraB) return letteraA.charCodeAt(0) - letteraB.charCodeAt(0);
      return parseInt(numeroA) - parseInt(numeroB);
    } else {
      const numeroA = parseInt(a.numero.match(/\d+/)?.[0] || '0');
      const numeroB = parseInt(b.numero.match(/\d+/)?.[0] || '0');
      return numeroA - numeroB;
    }
  });

  const postoSelezionatoData = posti.find(p => p.id === postoSelezionato);

  const renderSalaStudio = () => {
    const elementi: React.ReactElement[] = [];
    const TAVOLI_PER_FILA = 6;
    const LARGHEZZA_TAVOLO = 140;
    const ALTEZZA_TAVOLO = 60;
    const SPAZIO_TRA_TAVOLI = 60;
    const SPAZIO_CENTRALE = 140;
    const OFFSET_X = 60;
    const OFFSET_Y = 100;

    // Fila sinistra
    for (let t = 0; t < TAVOLI_PER_FILA; t++) {
      const tavoloX = OFFSET_X;
      const tavoloY = OFFSET_Y + t * (ALTEZZA_TAVOLO + SPAZIO_TRA_TAVOLI);
      const tavoloIndex = t;

      elementi.push(
        <rect key={`tavolo-sx-${t}`} x={tavoloX} y={tavoloY} width={LARGHEZZA_TAVOLO} height={ALTEZZA_TAVOLO}
          className="fill-muted stroke-border dark:fill-gray-700 dark:stroke-gray-600" strokeWidth="2" rx="4" />
      );

      for (let p = 0; p < 6; p++) {
        const postoGlobaleIndex = tavoloIndex * 6 + p;
        const posto = postiOrdinati[postoGlobaleIndex];
        if (!posto) continue;

        const isSelected = posto.id === postoSelezionato;
        let postoX, postoY;
        if (p < 3) {
          postoX = tavoloX + (p * (LARGHEZZA_TAVOLO / 3)) + (LARGHEZZA_TAVOLO / 6);
          postoY = tavoloY - 16;
        } else {
          postoX = tavoloX + ((p - 3) * (LARGHEZZA_TAVOLO / 3)) + (LARGHEZZA_TAVOLO / 6);
          postoY = tavoloY + ALTEZZA_TAVOLO + 16;
        }

        elementi.push(renderPostoCircle(posto, postoX, postoY, isSelected, `posto-sx-${tavoloIndex}-${p}`));
      }
    }

    // Fila destra
    for (let t = 0; t < TAVOLI_PER_FILA; t++) {
      const tavoloX = OFFSET_X + LARGHEZZA_TAVOLO + SPAZIO_CENTRALE;
      const tavoloY = OFFSET_Y + t * (ALTEZZA_TAVOLO + SPAZIO_TRA_TAVOLI);
      const tavoloIndex = 6 + t;

      elementi.push(
        <rect key={`tavolo-dx-${t}`} x={tavoloX} y={tavoloY} width={LARGHEZZA_TAVOLO} height={ALTEZZA_TAVOLO}
          className="fill-muted stroke-border dark:fill-gray-700 dark:stroke-gray-600" strokeWidth="2" rx="4" />
      );

      for (let p = 0; p < 6; p++) {
        const postoGlobaleIndex = tavoloIndex * 6 + p;
        const posto = postiOrdinati[postoGlobaleIndex];
        if (!posto) continue;

        const isSelected = posto.id === postoSelezionato;
        let postoX, postoY;
        if (p < 3) {
          postoX = tavoloX + (p * (LARGHEZZA_TAVOLO / 3)) + (LARGHEZZA_TAVOLO / 6);
          postoY = tavoloY - 16;
        } else {
          postoX = tavoloX + ((p - 3) * (LARGHEZZA_TAVOLO / 3)) + (LARGHEZZA_TAVOLO / 6);
          postoY = tavoloY + ALTEZZA_TAVOLO + 16;
        }

        elementi.push(renderPostoCircle(posto, postoX, postoY, isSelected, `posto-dx-${t}-${p}`));
      }
    }
    return elementi;
  };

  const renderSalaLettura = () => {
    const elementi: React.ReactElement[] = [];
    const POSTAZIONI_PER_FILA = 6;
    const LARGHEZZA_POSTAZIONE = 70;
    const ALTEZZA_POSTAZIONE = 70;
    const SPAZIO_TRA_POSTAZIONI = 30;
    const OFFSET_X = 40;
    const OFFSET_Y = 100;

    for (let i = 0; i < 30; i++) {
      const fila = Math.floor(i / POSTAZIONI_PER_FILA);
      const colonna = i % POSTAZIONI_PER_FILA;
      const x = OFFSET_X + colonna * (LARGHEZZA_POSTAZIONE + SPAZIO_TRA_POSTAZIONI);
      const y = OFFSET_Y + fila * (ALTEZZA_POSTAZIONE + SPAZIO_TRA_POSTAZIONI);

      const posto = postiOrdinati[i];
      if (!posto) continue;
      const isSelected = posto.id === postoSelezionato;

      elementi.push(
        <g key={`postazione-${i}`}>
          <title>{getPostoTooltip(posto)}</title>
          <rect x={x} y={y} width={LARGHEZZA_POSTAZIONE} height={ALTEZZA_POSTAZIONE}
            className="fill-indigo-100 stroke-indigo-500 dark:fill-indigo-900 dark:stroke-indigo-400" strokeWidth="2" rx="4" />
          <rect x={x - 3} y={y + 10} width="3" height={ALTEZZA_POSTAZIONE - 20} className="fill-indigo-200 dark:fill-indigo-700" opacity="0.5" />
          <rect x={x + LARGHEZZA_POSTAZIONE} y={y + 10} width="3" height={ALTEZZA_POSTAZIONE - 20} className="fill-indigo-200 dark:fill-indigo-700" opacity="0.5" />

          {renderPostoCircle(posto, x + LARGHEZZA_POSTAZIONE / 2, y + ALTEZZA_POSTAZIONE + 20, isSelected, `posto-s-${i}`, true)}

          {posto.caratteristiche.presaElettrica && (
            <circle cx={x + LARGHEZZA_POSTAZIONE - 10} cy={y + 10} r="4" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1" />
          )}
        </g>
      );
    }
    return elementi;
  };

  const renderSalaGruppi = () => {
    const elementi: React.ReactElement[] = [];
    const TAVOLI = 4;
    const POSTI_PER_TAVOLO = 5;
    const LARGHEZZA_TAVOLO = 180;
    const ALTEZZA_TAVOLO = 120;
    const SPAZIO_TRA_TAVOLI = 80;
    const OFFSET_X = 60;
    const OFFSET_Y = 100;

    for (let tavoloIndex = 0; tavoloIndex < TAVOLI; tavoloIndex++) {
      const fila = Math.floor(tavoloIndex / 2);
      const colonna = tavoloIndex % 2;
      const x = OFFSET_X + colonna * (LARGHEZZA_TAVOLO + SPAZIO_TRA_TAVOLI);
      const y = OFFSET_Y + fila * (ALTEZZA_TAVOLO + SPAZIO_TRA_TAVOLI);

      elementi.push(
        <rect key={`tavolo-gruppo-${tavoloIndex}`} x={x} y={y} width={LARGHEZZA_TAVOLO} height={ALTEZZA_TAVOLO}
          className="fill-green-100 stroke-green-500 dark:fill-green-900 dark:stroke-green-400" strokeWidth="3" rx="12" />
      );

      for (let postoIndex = 0; postoIndex < POSTI_PER_TAVOLO; postoIndex++) {
        const postoGlobaleIndex = tavoloIndex * POSTI_PER_TAVOLO + postoIndex;
        const posto = postiOrdinati[postoGlobaleIndex];
        if (!posto) continue;
        const isSelected = posto.id === postoSelezionato;
        let postoX: number, postoY: number;

        if (postoIndex === 0) { postoX = x + LARGHEZZA_TAVOLO * 0.3; postoY = y - 18; }
        else if (postoIndex === 1) { postoX = x + LARGHEZZA_TAVOLO * 0.7; postoY = y - 18; }
        else if (postoIndex === 2) { postoX = x + LARGHEZZA_TAVOLO * 0.3; postoY = y + ALTEZZA_TAVOLO + 18; }
        else if (postoIndex === 3) { postoX = x + LARGHEZZA_TAVOLO * 0.7; postoY = y + ALTEZZA_TAVOLO + 18; }
        else { postoX = x + LARGHEZZA_TAVOLO + 18; postoY = y + ALTEZZA_TAVOLO / 2; }

        elementi.push(renderPostoCircle(posto, postoX, postoY, isSelected, `posto-g-${postoGlobaleIndex}`));
      }
    }
    return elementi;
  };

  /* Helper per renderizzare hitbox invisibile e cerchio visivo */
  const renderPostoCircle = (posto: Posto, cx: number, cy: number, isSelected: boolean, key: string, isSalaLettura = false) => (
    <g key={key}>
      <title>{getPostoTooltip(posto)}</title>

      {/* 1. HITBOX INVISIBILE PER TOCCO FACILITATO (Raggio 24 = ~48px diametro su scala 1:1) */}
      <circle
        cx={cx}
        cy={cy}
        r="24"
        fill="transparent"
        className={posto.stato === 'DISPONIBILE' ? 'cursor-pointer' : ''}
        onClick={() => handlePostoClick(posto)}
        onPointerUp={() => { if (!isDragging) handlePostoClick(posto); }}
      />

      {/* 2. Cerchio Visivo (leggermente ingrandito: 12->14, sel 14->16) */}
      <circle
        cx={cx}
        cy={cy}
        r={isSelected ? 16 : 14}
        fill={getPostoColor(posto.stato, isSelected)}
        stroke={isSelected ? '#1e40af' : 'white'}
        strokeWidth={isSelected ? 3 : 2}
        className={`pointer-events-none ${posto.stato === 'DISPONIBILE' ? 'opacity-100' : 'opacity-60'}`}
      /* Nota: pointer-events-none perché l'hitbox sopra gestisce i click */
      />

      <text
        x={cx}
        y={cy + 5}
        textAnchor="middle"
        fill="white"
        fontSize={isSalaLettura ? "11" : "10"}
        fontWeight="bold"
        className="pointer-events-none select-none"
      >
        {posto.numero}
      </text>

      {!isSalaLettura && posto.caratteristiche.presaElettrica && (
        <circle cx={cx} cy={cy - 20} r="4" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.5" className="pointer-events-none" />
      )}
    </g>
  );

  const getSVGDimensions = () => {
    if (salaId === 1) return { viewBox: "0 0 500 820", aspectRatio: '16/12', height: 820 };
    if (salaId === 2) return { viewBox: "0 0 500 900", aspectRatio: '16/14', height: 900 };
    if (salaId === 3) return { viewBox: "0 0 500 600", aspectRatio: '16/10', height: 600 };
    return { viewBox: "0 0 500 700", aspectRatio: '16/10', height: 700 };
  };

  const svgDimensions = getSVGDimensions();

  const getSalaDescription = () => {
    if (salaId === 1) return "2 file di 6 tavoli • 72 posti";
    if (salaId === 2) return "30 postazioni individuali silenziose";
    if (salaId === 3) return "4 tavoli grandi per lavoro di gruppo • 20 posti";
    return "";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-foreground">{sala}</h3>
          <p className="text-sm text-muted-foreground">Piano {piano} • {getSalaDescription()}</p>
        </div>
        <div className="flex gap-2 bg-background/80 backdrop-blur rounded-lg p-1 border shadow-sm">
          <Button variant="ghost" size="icon" onClick={resetView} className="h-8 w-8 hover:bg-muted" title="Reset vista">
            <Maximize className="h-4 w-4" />
          </Button>
          <div className="w-px bg-border h-6 my-auto" />
          <Button variant="ghost" size="icon" onClick={zoomOut} className="h-8 w-8 hover:bg-muted" title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={zoomIn} className="h-8 w-8 hover:bg-muted" title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-green-500" /><span>Disponibile</span></div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-amber-500" /><span>Prenotato</span></div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-red-500" /><span>Occupato</span></div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-blue-500" /><span>Selezionato</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-400 border border-amber-600" /><span>Presa elettrica</span></div>
          </div>
        </CardContent>
      </Card>

      <div className="relative overflow-hidden rounded-lg border-2 border-border bg-card dark:bg-gray-800 touch-none select-none">
        <div
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: svgDimensions.aspectRatio, cursor: isDragging ? 'grabbing' : 'grab' }}
          role="application"
          aria-label={`Mappa interattiva della ${sala}. Usa drag per spostarti e strumenti zoom.`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
        >
          <svg
            viewBox={svgDimensions.viewBox}
            className="w-full h-full block"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center',
              transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)'
            }}
            role="img"
          >
            <rect x="0" y="0" width="500" height={svgDimensions.height} className="fill-muted dark:fill-gray-900" />

            {salaId === 1 && (
              <>
                <rect x="20" y="20" width="460" height="60" fill="#dbeafe" opacity="0.3" stroke="#3b82f6" strokeWidth="2" rx="4" />
                <text x="250" y="50" textAnchor="middle" fill="#3b82f6" fontSize="14" fontWeight="bold">📚 SALA STUDIO PRINCIPALE</text>
                <text x="130" y="80" textAnchor="middle" fontSize="12" fill="#64748b" fontWeight="600">FILA SINISTRA</text>
                <text x="340" y="80" textAnchor="middle" fontSize="12" fill="#64748b" fontWeight="600">FILA DESTRA</text>
                {renderSalaStudio()}
              </>
            )}

            {salaId === 2 && (
              <>
                <rect x="20" y="20" width="460" height="60" fill="#e0e7ff" opacity="0.3" stroke="#6366f1" strokeWidth="2" rx="4" />
                <text x="250" y="45" textAnchor="middle" fill="#6366f1" fontSize="14" fontWeight="bold">🤫 SALA LETTURA SILENZIOSA</text>
                <text x="250" y="65" textAnchor="middle" fill="#6366f1" fontSize="11" opacity="0.8">Zona Silenzio Assoluto • Postazioni Individuali</text>
                {renderSalaLettura()}
              </>
            )}

            {salaId === 3 && (
              <>
                <rect x="20" y="20" width="460" height="60" fill="#dcfce7" opacity="0.3" stroke="#22c55e" strokeWidth="2" rx="4" />
                <text x="250" y="45" textAnchor="middle" fill="#22c55e" fontSize="14" fontWeight="bold">👥 SALA LAVORO DI GRUPPO</text>
                <text x="250" y="65" textAnchor="middle" fill="#22c55e" fontSize="11" opacity="0.8">Conversazione Consentita • Tavoli Collaborativi</text>
                {renderSalaGruppi()}
              </>
            )}
          </svg>
        </div>

        {zoom === 1 && !isDragging && (
          <div className="absolute inset-x-0 bottom-4 pointer-events-none flex justify-center opacity-70 animate-pulse">
            <Badge variant="secondary" className="shadow-sm">Tocca e trascina per muoverti</Badge>
          </div>
        )}
      </div>

      {postoSelezionatoData && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 animate-in slide-in-from-bottom duration-300">
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-foreground">Posto {postoSelezionatoData.numero}</h4>
                <Badge className="bg-green-500 text-white">Disponibile</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {postoSelezionatoData.caratteristiche.presaElettrica && <Badge variant="secondary" className="flex items-center gap-1"><Zap className="h-3 w-3" />Presa elettrica</Badge>}
                {postoSelezionatoData.caratteristiche.finestraVicina && <Badge variant="secondary" className="flex items-center gap-1"><Sun className="h-3 w-3" />Vicino finestra</Badge>}
                {postoSelezionatoData.caratteristiche.silenzioso && <Badge variant="secondary" className="flex items-center gap-1"><VolumeX className="h-3 w-3" />Zona silenziosa</Badge>}
                {postoSelezionatoData.caratteristiche.wifi && <Badge variant="secondary" className="flex items-center gap-1"><Wifi className="h-3 w-3" />WiFi ottimale</Badge>}
                {postoSelezionatoData.caratteristiche.accessibile && <Badge variant="secondary" className="flex items-center gap-1"><Accessibility className="h-3 w-3" />Accessibile</Badge>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
