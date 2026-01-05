import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: "Non autenticato" },
        { status: 401 }
      );
    }

    if (session.user.ruolo !== "ADMIN" && session.user.ruolo !== "BIBLIOTECARIO") {
      return NextResponse.json(
        { error: "Accesso negato" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get("tipo");

    switch (tipo) {
      case "occupazione-oraria": {
        // Occupazione per fascia oraria (ultimi 7 giorni)
        const setteGiorniFa = new Date();
        setteGiorniFa.setDate(setteGiorniFa.getDate() - 7);

        const prenotazioni = await prisma.prenotazione.findMany({
          where: {
            data: { gte: setteGiorniFa },
            stato: { in: ["CHECK_IN", "COMPLETATA"] }
          },
          select: {
            oraInizio: true
          }
        });

        // Raggruppa per fascia oraria
        const occupazionePerOra: Record<string, number> = {};
        for (let i = 8; i <= 22; i++) {
          const ora = `${i.toString().padStart(2, '0')}:00`;
          occupazionePerOra[ora] = 0;
        }

        prenotazioni.forEach(p => {
          const ora = new Date(`1970-01-01T${p.oraInizio}`);
          const oraKey = `${ora.getHours().toString().padStart(2, '0')}:00`;
          if (occupazionePerOra[oraKey] !== undefined) {
            occupazionePerOra[oraKey]++;
          }
        });

        const data = Object.entries(occupazionePerOra).map(([ora, count]) => ({
          ora,
          prenotazioni: count
        }));

        return NextResponse.json({ data });
      }

      case "trend-prenotazioni": {
        // Trend prenotazioni ultimi 30 giorni
        const trentaGiorniFa = new Date();
        trentaGiorniFa.setDate(trentaGiorniFa.getDate() - 30);

        const prenotazioni = await prisma.prenotazione.findMany({
          where: {
            data: { gte: trentaGiorniFa }
          },
          select: {
            data: true,
            stato: true
          }
        });

        // Raggruppa per giorno
        const trendPerGiorno: Record<string, { confermate: number; noShow: number }> = {};
        
        for (let i = 0; i < 30; i++) {
          const data = new Date();
          data.setDate(data.getDate() - i);
          const dataKey = data.toISOString().split('T')[0];
          trendPerGiorno[dataKey] = { confermate: 0, noShow: 0 };
        }

        prenotazioni.forEach(p => {
          const dataKey = p.data.toISOString().split('T')[0];
          if (trendPerGiorno[dataKey]) {
            if (p.stato === "NO_SHOW") {
              trendPerGiorno[dataKey].noShow++;
            } else if (p.stato === "CONFERMATA" || p.stato === "CHECK_IN" || p.stato === "COMPLETATA") {
              trendPerGiorno[dataKey].confermate++;
            }
          }
        });

        const data = Object.entries(trendPerGiorno)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([data, counts]) => ({
            data: new Date(data).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
            confermate: counts.confermate,
            noShow: counts.noShow,
            totale: counts.confermate + counts.noShow
          }));

        return NextResponse.json({ data });
      }

      case "utenti-attivi": {
        // Top 10 utenti più attivi
        const prenotazioni = await prisma.prenotazione.groupBy({
          by: ['userId'],
          _count: {
            id: true
          },
          orderBy: {
            _count: {
              id: 'desc'
            }
          },
          take: 10
        });

        const utentiIds = prenotazioni.map(p => p.userId);
        const utenti = await prisma.user.findMany({
          where: { id: { in: utentiIds } },
          select: {
            id: true,
            nome: true,
            cognome: true
          }
        });

        const data = prenotazioni.map(p => {
          const utente = utenti.find(u => u.id === p.userId);
          return {
            nome: utente ? `${utente.nome} ${utente.cognome}` : 'Sconosciuto',
            prenotazioni: p._count.id
          };
        });

        return NextResponse.json({ data });
      }

      case "libri-prestati": {
        // Top 10 libri più prestati
        const prestiti = await prisma.prestito.groupBy({
          by: ['libroId'],
          _count: {
            id: true
          },
          orderBy: {
            _count: {
              id: 'desc'
            }
          },
          take: 10
        });

        const libriIds = prestiti.map(p => p.libroId);
        const libri = await prisma.libro.findMany({
          where: { id: { in: libriIds } },
          select: {
            id: true,
            titolo: true,
            autore: true
          }
        });

        const data = prestiti.map(p => {
          const libro = libri.find(l => l.id === p.libroId);
          return {
            titolo: libro?.titolo || 'Sconosciuto',
            autore: libro?.autore || '',
            prestiti: p._count.id
          };
        });

        return NextResponse.json({ data });
      }

      case "tasso-noshow": {
        // Tasso no-show ultimi 30 giorni
        const trentaGiorniFa = new Date();
        trentaGiorniFa.setDate(trentaGiorniFa.getDate() - 30);

        const prenotazioni = await prisma.prenotazione.groupBy({
          by: ['stato'],
          where: {
            data: { gte: trentaGiorniFa }
          },
          _count: {
            id: true
          }
        });

        const totale = prenotazioni.reduce((sum, p) => sum + p._count.id, 0);
        
        const data = prenotazioni.map(p => ({
          nome: p.stato === "NO_SHOW" ? "No-show" : p.stato === "COMPLETATA" ? "Completate" : "Altre",
          valore: p._count.id,
          percentuale: totale > 0 ? ((p._count.id / totale) * 100).toFixed(1) : 0
        }));

        // Raggruppa stati minori in "Altre"
        const noShow = data.find(d => d.nome === "No-show");
        const completate = data.find(d => d.nome === "Completate");
        const altre = data.filter(d => d.nome === "Altre").reduce((sum, d) => sum + d.valore, 0);

        const risultato = [
          noShow || { nome: "No-show", valore: 0, percentuale: "0.0" },
          completate || { nome: "Completate", valore: 0, percentuale: "0.0" },
          { nome: "Altre", valore: altre, percentuale: totale > 0 ? ((altre / totale) * 100).toFixed(1) : "0.0" }
        ];

        return NextResponse.json({ data: risultato });
      }

      default:
        return NextResponse.json(
          { error: "Tipo statistiche non valido" },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error("Errore API statistiche:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
