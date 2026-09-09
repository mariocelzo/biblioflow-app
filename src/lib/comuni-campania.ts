// ============================================================================
// COMUNI DELLA CAMPANIA - BiblioFlow
// ============================================================================
// COSA: elenco dei comuni campani (tutti i 158 della provincia di Salerno piu'
//       i principali delle altre quattro province) e le funzioni di ricerca
//       usate dal menu a tendina del wizard di registrazione.
//
// PERCHE': BiblioFlow serve la biblioteca dell'Universita' di Salerno. Il campo
//       "citta' di residenza" era testo libero, quindi ogni utente scriveva
//       come voleva ("Nocera Inf.", "nocera inferiore", "NOCERA") e il dato
//       risultante era inutilizzabile per qualsiasi statistica sul pendolarismo.
//       Un elenco chiuso normalizza il dato all'origine e riduce gli errori di
//       battitura, che sono la fonte di attrito piu' comune nei form (HCI:
//       "prevenzione dell'errore" invece di "correzione dell'errore").
//
// PERCHE' SOLO LA CAMPANIA: il bacino d'utenza reale dell'ateneo. Un elenco di
//       tutti gli 8.000 comuni italiani renderebbe la ricerca meno precisa
//       senza servire nessuno. Il campo resta comunque FACOLTATIVO, quindi chi
//       viene da fuori regione semplicemente non lo compila.

/** Le cinque province della Campania, con la sigla usata nelle etichette. */
export const PROVINCE_CAMPANIA = {
  Salerno: "SA",
  Napoli: "NA",
  Avellino: "AV",
  Benevento: "BN",
  Caserta: "CE",
} as const;

export type ProvinciaCampania = keyof typeof PROVINCE_CAMPANIA;
export type SiglaProvincia = (typeof PROVINCE_CAMPANIA)[ProvinciaCampania];

export interface ComuneCampania {
  /** Denominazione ufficiale del comune (con accenti e apostrofi corretti). */
  nome: string;
  provincia: ProvinciaCampania;
  sigla: SiglaProvincia;
}

// ----------------------------------------------------------------------------
// Dati grezzi, raggruppati per provincia.
// ----------------------------------------------------------------------------
// Sono elencati in ordine alfabetico per provincia solo per comodita' di
// manutenzione: l'ordinamento vero (alfabetico su tutta la regione, con
// `localeCompare` italiano) viene ricalcolato piu' sotto, cosi' aggiungere un
// comune in fondo a un gruppo non puo' rompere l'ordine mostrato all'utente.

const COMUNI_PER_PROVINCIA: Record<ProvinciaCampania, readonly string[]> = {
  // Provincia di Salerno: elenco COMPLETO (158 comuni).
  // E' la provincia dell'ateneo, quindi qui l'esaustivita' e' un requisito:
  // un pendolare di un piccolo comune del Cilento deve potersi trovare.
  Salerno: [
    "Acerno",
    "Agropoli",
    "Albanella",
    "Alfano",
    "Altavilla Silentina",
    "Amalfi",
    "Angri",
    "Aquara",
    "Ascea",
    "Atena Lucana",
    "Atrani",
    "Auletta",
    "Baronissi",
    "Battipaglia",
    "Bellizzi",
    "Bellosguardo",
    "Bracigliano",
    "Buccino",
    "Buonabitacolo",
    "Caggiano",
    "Calvanico",
    "Camerota",
    "Campagna",
    "Campora",
    "Cannalonga",
    "Capaccio Paestum",
    "Casal Velino",
    "Casalbuono",
    "Casaletto Spartano",
    "Caselle in Pittari",
    "Castel San Giorgio",
    "Castel San Lorenzo",
    "Castelcivita",
    "Castellabate",
    "Castelnuovo Cilento",
    "Castelnuovo di Conza",
    "Castiglione del Genovesi",
    "Cava de' Tirreni",
    "Celle di Bulgheria",
    "Centola",
    "Ceraso",
    "Cetara",
    "Cicerale",
    "Colliano",
    "Conca dei Marini",
    "Controne",
    "Contursi Terme",
    "Corbara",
    "Corleto Monforte",
    "Cuccaro Vetere",
    "Eboli",
    "Felitto",
    "Fisciano",
    "Furore",
    "Futani",
    "Giffoni Sei Casali",
    "Giffoni Valle Piana",
    "Gioi",
    "Giungano",
    "Ispani",
    "Laureana Cilento",
    "Laurino",
    "Laurito",
    "Laviano",
    "Lustra",
    "Magliano Vetere",
    "Maiori",
    "Mercato San Severino",
    "Minori",
    "Moio della Civitella",
    "Montano Antilia",
    "Monte San Giacomo",
    "Montecorice",
    "Montecorvino Pugliano",
    "Montecorvino Rovella",
    "Monteforte Cilento",
    "Montesano sulla Marcellana",
    "Morigerati",
    "Nocera Inferiore",
    "Nocera Superiore",
    "Novi Velia",
    "Ogliastro Cilento",
    "Olevano sul Tusciano",
    "Oliveto Citra",
    "Omignano",
    "Orria",
    "Ottati",
    "Padula",
    "Pagani",
    "Palomonte",
    "Pellezzano",
    "Perdifumo",
    "Perito",
    "Pertosa",
    "Petina",
    "Piaggine",
    "Pisciotta",
    "Polla",
    "Pollica",
    "Pontecagnano Faiano",
    "Positano",
    "Postiglione",
    "Praiano",
    "Prignano Cilento",
    "Ravello",
    "Ricigliano",
    "Roccadaspide",
    "Roccagloriosa",
    "Roccapiemonte",
    "Rofrano",
    "Romagnano al Monte",
    "Roscigno",
    "Rutino",
    "Sacco",
    "Sala Consilina",
    "Salento",
    "Salerno",
    "Salvitelle",
    "San Cipriano Picentino",
    "San Giovanni a Piro",
    "San Gregorio Magno",
    "San Mango Piemonte",
    "San Marzano sul Sarno",
    "San Mauro Cilento",
    "San Mauro la Bruca",
    "San Pietro al Tanagro",
    "San Rufo",
    "San Valentino Torio",
    "Sant'Angelo a Fasanella",
    "Sant'Arsenio",
    "Sant'Egidio del Monte Albino",
    "Santa Marina",
    "Santomenna",
    "Sanza",
    "Sapri",
    "Sarno",
    "Sassano",
    "Scafati",
    "Scala",
    "Serramezzana",
    "Serre",
    "Sessa Cilento",
    "Siano",
    "Sicignano degli Alburni",
    "Stella Cilento",
    "Stio",
    "Teggiano",
    "Torchiara",
    "Torraca",
    "Torre Orsaia",
    "Tortorella",
    "Tramonti",
    "Trentinara",
    "Valle dell'Angelo",
    "Vallo della Lucania",
    "Valva",
    "Vibonati",
    "Vietri sul Mare",
  ],

  // Province limitrofe: i comuni principali (capoluoghi, centri sopra i ~5.000
  // abitanti e quelli serviti dalle linee ferroviarie/bus verso Fisciano e
  // Baronissi). Non e' l'elenco completo perche' il valore aggiunto sarebbe
  // marginale rispetto al peso del bundle: chi manca puo' lasciare il campo
  // vuoto, che resta facoltativo.
  Napoli: [
    "Acerra",
    "Afragola",
    "Agerola",
    "Anacapri",
    "Arzano",
    "Bacoli",
    "Barano d'Ischia",
    "Boscoreale",
    "Boscotrecase",
    "Brusciano",
    "Caivano",
    "Calvizzano",
    "Capri",
    "Casalnuovo di Napoli",
    "Casandrino",
    "Casavatore",
    "Casoria",
    "Castellammare di Stabia",
    "Cercola",
    "Cicciano",
    "Cimitile",
    "Crispano",
    "Ercolano",
    "Forio",
    "Frattamaggiore",
    "Frattaminore",
    "Giugliano in Campania",
    "Gragnano",
    "Grumo Nevano",
    "Ischia",
    "Lettere",
    "Marano di Napoli",
    "Marigliano",
    "Massa Lubrense",
    "Melito di Napoli",
    "Meta",
    "Mugnano di Napoli",
    "Napoli",
    "Nola",
    "Ottaviano",
    "Piano di Sorrento",
    "Pimonte",
    "Poggiomarino",
    "Pollena Trocchia",
    "Pomigliano d'Arco",
    "Pompei",
    "Portici",
    "Pozzuoli",
    "Procida",
    "Qualiano",
    "Quarto",
    "San Giorgio a Cremano",
    "San Giuseppe Vesuviano",
    "San Sebastiano al Vesuvio",
    "Sant'Agnello",
    "Sant'Anastasia",
    "Sant'Antimo",
    "Sant'Antonio Abate",
    "Santa Maria la Carità",
    "Saviano",
    "Scisciano",
    "Somma Vesuviana",
    "Sorrento",
    "Terzigno",
    "Torre Annunziata",
    "Torre del Greco",
    "Trecase",
    "Vico Equense",
    "Villaricca",
    "Volla",
  ],

  Avellino: [
    "Aiello del Sabato",
    "Altavilla Irpina",
    "Ariano Irpino",
    "Atripalda",
    "Avellino",
    "Bagnoli Irpino",
    "Baiano",
    "Bisaccia",
    "Calitri",
    "Cervinara",
    "Contrada",
    "Grottaminarda",
    "Lauro",
    "Lioni",
    "Mercogliano",
    "Mirabella Eclano",
    "Monteforte Irpino",
    "Montella",
    "Montemiletto",
    "Montoro",
    "Mugnano del Cardinale",
    "Nusco",
    "Pratola Serra",
    "Quindici",
    "Rotondi",
    "Sant'Angelo dei Lombardi",
    "Serino",
    "Solofra",
    "Sperone",
    "Summonte",
    "Taurano",
    "Torella dei Lombardi",
    "Vallata",
    "Vallesaccarda",
    "Volturara Irpina",
  ],

  Benevento: [
    "Airola",
    "Apice",
    "Benevento",
    "Bonea",
    "Bucciano",
    "Cerreto Sannita",
    "Colle Sannita",
    "Dugenta",
    "Durazzano",
    "Faicchio",
    "Foglianise",
    "Fragneto Monforte",
    "Guardia Sanframondi",
    "Limatola",
    "Moiano",
    "Montesarchio",
    "Morcone",
    "Paolisi",
    "Pietrelcina",
    "Ponte",
    "Puglianello",
    "San Giorgio del Sannio",
    "San Leucio del Sannio",
    "San Marco dei Cavoti",
    "San Martino Sannita",
    "San Nicola Manfredi",
    "San Salvatore Telesino",
    "Sant'Agata de' Goti",
    "Solopaca",
    "Telese Terme",
    "Torrecuso",
    "Vitulano",
  ],

  Caserta: [
    "Alife",
    "Arienzo",
    "Aversa",
    "Capua",
    "Carinaro",
    "Casagiove",
    "Casal di Principe",
    "Casaluce",
    "Casapulla",
    "Caserta",
    "Castel Volturno",
    "Cellole",
    "Cervino",
    "Cesa",
    "Curti",
    "Frignano",
    "Grazzanise",
    "Gricignano di Aversa",
    "Lusciano",
    "Macerata Campania",
    "Maddaloni",
    "Marcianise",
    "Mondragone",
    "Orta di Atella",
    "Parete",
    "Piedimonte Matese",
    "Pignataro Maggiore",
    "Portico di Caserta",
    "Recale",
    "San Cipriano d'Aversa",
    "San Felice a Cancello",
    "San Marcellino",
    "San Nicola la Strada",
    "San Prisco",
    "San Tammaro",
    "Sant'Arpino",
    "Santa Maria a Vico",
    "Santa Maria Capua Vetere",
    "Sessa Aurunca",
    "Succivo",
    "Teano",
    "Teverola",
    "Trentola Ducenta",
    "Vairano Patenora",
    "Villa Literno",
    "Vitulazio",
  ],
};

// ----------------------------------------------------------------------------
// Normalizzazione per la ricerca
// ----------------------------------------------------------------------------

/**
 * Riduce una stringa alla forma "confrontabile" usata dalla ricerca.
 *
 * COSA FA: minuscole, rimozione dei segni diacritici (à→a, è→e...), apostrofi e
 * punteggiatura trasformati in spazio, spazi multipli compattati.
 *
 * PERCHE': i nomi dei comuni campani sono pieni di apostrofi e accenti
 * ("Sant'Angelo a Fasanella", "Cava de' Tirreni", "Santa Maria la Carità").
 * Nessuno li digita cosi': si scrive "sant angelo" o "santa maria la carita".
 * Senza normalizzazione la ricerca fallirebbe proprio sui nomi piu' comuni,
 * e l'utente concluderebbe che il suo comune non c'e'.
 */
export function normalizzaPerRicerca(testo: string): string {
  return testo
    .normalize("NFD") // separa la lettera dal suo segno diacritico...
    // ...e scarta il segno. Va fatto QUI, prima della riga sotto: altrimenti
    // l'accento rimasto isolato verrebbe convertito in spazio e "Carità"
    // diventerebbe "carit a", spezzando la parola in due.
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ") // apostrofi, trattini e punti diventano spazi
    .trim();
}

/**
 * Variante "compatta" (senza spazi) della forma normalizzata.
 *
 * PERCHE': serve a far funzionare anche chi digita tutto attaccato
 * ("santangelo", "cavadetirreni"), che e' il modo in cui molti cercano quando
 * non ricordano dove cada l'apostrofo.
 */
function compatta(testoNormalizzato: string): string {
  return testoNormalizzato.replace(/ /g, "");
}

// Indice precalcolato: la normalizzazione costa, e la ricerca gira a ogni
// battuta sulla tastiera. Calcolarla una volta sola all'import evita di
// rinormalizzare ~380 nomi per ogni carattere digitato.
interface VoceIndice {
  comune: ComuneCampania;
  normalizzato: string;
  compattato: string;
}

const INDICE: readonly VoceIndice[] = Object.entries(COMUNI_PER_PROVINCIA)
  .flatMap(([provincia, nomi]) =>
    nomi.map((nome) => ({
      nome,
      provincia: provincia as ProvinciaCampania,
      sigla: PROVINCE_CAMPANIA[provincia as ProvinciaCampania],
    })),
  )
  // Ordine alfabetico italiano: `localeCompare("it")` mette "Àcerno" accanto ad
  // "Acerno" invece che in fondo, come farebbe il confronto per code point.
  .sort((a, b) => a.nome.localeCompare(b.nome, "it"))
  .map((comune) => {
    const normalizzato = normalizzaPerRicerca(comune.nome);
    return { comune, normalizzato, compattato: compatta(normalizzato) };
  });

/** Tutti i comuni disponibili, gia' ordinati alfabeticamente. */
export const COMUNI_CAMPANIA: readonly ComuneCampania[] = INDICE.map(
  (voce) => voce.comune,
);

/**
 * Etichetta mostrata nel menu e salvata nel profilo: "Nocera Inferiore (SA)".
 *
 * PERCHE' LA SIGLA: l'API compone `Da: {citta} | Mezzo: ... | Tempo: ... min`.
 * Con la sigla il bibliotecario che legge il tragitto capisce subito la
 * distanza in gioco senza dover conoscere a memoria 380 comuni.
 */
export function etichettaComune(comune: ComuneCampania): string {
  return `${comune.nome} (${comune.sigla})`;
}

/**
 * Ritrova un comune a partire da un valore salvato in precedenza.
 *
 * Accetta sia l'etichetta completa ("Agropoli (SA)") sia il solo nome: cosi'
 * i profili gia' compilati a mano prima di questa modifica continuano a essere
 * riconosciuti quando l'utente torna sul form.
 */
export function trovaComune(valore: string): ComuneCampania | undefined {
  const cercato = normalizzaPerRicerca(valore);
  if (!cercato) return undefined;
  return INDICE.find(
    (voce) =>
      voce.normalizzato === cercato ||
      normalizzaPerRicerca(etichettaComune(voce.comune)) === cercato,
  )?.comune;
}

export interface OpzioniRicercaComuni {
  /** Numero massimo di risultati restituiti (default 50). */
  limite?: number;
}

/**
 * Cerca i comuni che corrispondono a quanto digitato.
 *
 * REGOLE DI MATCH (in ordine di priorita', il punteggio piu' basso vince):
 *  0. il nome INIZIA con il testo digitato        → "sal" ⇒ Salerno, Salento...
 *  1. una PAROLA del nome inizia col testo        → "lucania" ⇒ Vallo della Lucania
 *  2. il nome CONTIENE il testo                   → "cilento" ⇒ Casal Velino? no, ma Sessa Cilento si'
 *  3. match "compatto", senza spazi ne' apostrofi → "santangelo" ⇒ Sant'Angelo a Fasanella
 *
 * PERCHE' IL PUNTEGGIO: con 380 voci una ricerca per sola sottostringa mette
 * risultati marginali sopra quello ovvio (digitando "salerno" comparirebbe
 * prima "Ogliastro..."). Ordinare per tipo di match e poi alfabeticamente
 * rende il primo risultato quasi sempre quello giusto, che e' cio' che conta
 * quando si naviga da tastiera.
 *
 * A parita' di punteggio si mantiene l'ordine alfabetico, perche' l'indice e'
 * gia' ordinato e `Array.prototype.sort` in JS e' stabile.
 */
export function cercaComuni(
  query: string,
  opzioni: OpzioniRicercaComuni = {},
): ComuneCampania[] {
  const limite = opzioni.limite ?? 50;
  const cercato = normalizzaPerRicerca(query);

  // Query vuota: si mostra semplicemente l'inizio dell'elenco alfabetico,
  // cosi' il menu non e' mai vuoto all'apertura (evita il "dead end" in cui
  // l'utente non capisce se il campo funzioni).
  if (!cercato) return COMUNI_CAMPANIA.slice(0, limite);

  const cercatoCompatto = compatta(cercato);

  const risultati: { comune: ComuneCampania; punteggio: number }[] = [];

  for (const voce of INDICE) {
    let punteggio = -1;

    if (voce.normalizzato.startsWith(cercato)) {
      punteggio = 0;
    } else if (voce.normalizzato.includes(` ${cercato}`)) {
      punteggio = 1;
    } else if (voce.normalizzato.includes(cercato)) {
      punteggio = 2;
    } else if (voce.compattato.includes(cercatoCompatto)) {
      punteggio = 3;
    }

    if (punteggio >= 0) risultati.push({ comune: voce.comune, punteggio });
  }

  return risultati
    .sort((a, b) => a.punteggio - b.punteggio)
    .slice(0, limite)
    .map((r) => r.comune);
}
