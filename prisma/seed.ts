import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
import { hashPassword } from "../src/lib/password";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Avvio seed database BiblioFlow...\n");

  // ============================================
  // 1. PULIZIA DATABASE (ordine per FK)
  // ============================================
  console.log("🧹 Pulizia dati esistenti...");
  await prisma.logEvento.deleteMany();
  await prisma.notifica.deleteMany();
  await prisma.prestito.deleteMany();
  await prisma.prenotazione.deleteMany();
  await prisma.posto.deleteMany();
  await prisma.libro.deleteMany();
  await prisma.sala.deleteMany();
  await prisma.user.deleteMany();

  // ============================================
  // 2. UTENTI
  // ============================================
  console.log("👤 Creazione utenti...");

  // Hash delle password
  const passwordStudenti = await hashPassword("password123");
  const passwordAdmin = await hashPassword("admin123");
  const passwordStaff = await hashPassword("staff123");

  const studenti = await Promise.all([
    prisma.user.create({
      data: {
        email: "mario.rossi@studenti.unisa.it",
        nome: "Mario",
        cognome: "Rossi",
        matricola: "0512110001",
        passwordHash: passwordStudenti,
        ruolo: "STUDENTE",
        isPendolare: true,
        notifichePush: true,
        notificheEmail: true,
      },
    }),
    prisma.user.create({
      data: {
        email: "laura.bianchi@studenti.unisa.it",
        nome: "Laura",
        cognome: "Bianchi",
        matricola: "0512110002",
        passwordHash: passwordStudenti,
        ruolo: "STUDENTE",
        isPendolare: false,
      },
    }),
    prisma.user.create({
      data: {
        email: "giuseppe.verdi@studenti.unisa.it",
        nome: "Giuseppe",
        cognome: "Verdi",
        matricola: "0512110003",
        passwordHash: passwordStudenti,
        ruolo: "STUDENTE",
        necessitaAccessibilita: true,
      },
    }),
    prisma.user.create({
      data: {
        email: "anna.neri@studenti.unisa.it",
        nome: "Anna",
        cognome: "Neri",
        matricola: "0512110004",
        passwordHash: passwordStudenti,
        ruolo: "STUDENTE",
      },
    }),
    prisma.user.create({
      data: {
        email: "luca.ferrari@studenti.unisa.it",
        nome: "Luca",
        cognome: "Ferrari",
        matricola: "0512110005",
        passwordHash: passwordStudenti,
        ruolo: "STUDENTE",
      },
    }),
  ]);

  const bibliotecari = await Promise.all([
    prisma.user.create({
      data: {
        email: "admin@biblioteca.unisa.it",
        nome: "Admin",
        cognome: "Sistema",
        passwordHash: passwordAdmin,
        ruolo: "ADMIN",
      },
    }),
    prisma.user.create({
      data: {
        email: "giulia.romano@biblioteca.unisa.it",
        nome: "Giulia",
        cognome: "Romano",
        passwordHash: passwordStaff,
        ruolo: "BIBLIOTECARIO",
      },
    }),
    prisma.user.create({
      data: {
        email: "marco.bianchi@biblioteca.unisa.it",
        nome: "Marco",
        cognome: "Bianchi",
        passwordHash: passwordStaff,
        ruolo: "BIBLIOTECARIO",
      },
    }),
  ]);

  console.log(`   ✓ ${studenti.length} studenti creati`);
  console.log(`   ✓ ${bibliotecari.length} bibliotecari creati`);

  // ============================================
  // 3. SALE
  // ============================================
  console.log("🏛️ Creazione sale...");

  const sale = await Promise.all([
    prisma.sala.create({
      data: {
        nome: "Sala Studio Principale",
        piano: 1,
        descrizione: "Sala studio principale al primo piano della biblioteca centrale",
        isSilenziosa: false,
        isGruppi: false,
        capienzaMax: 50,
        orarioApertura: "08:00",
        orarioChiusura: "22:00",
      },
    }),
    prisma.sala.create({
      data: {
        nome: "Sala Lettura Silenziosa",
        piano: 2,
        descrizione: "Sala dedicata allo studio silenzioso, vietato l'uso di dispositivi rumorosi",
        isSilenziosa: true,
        isGruppi: false,
        capienzaMax: 30,
        orarioApertura: "08:00",
        orarioChiusura: "20:00",
      },
    }),
    prisma.sala.create({
      data: {
        nome: "Sala Gruppi",
        piano: 1,
        descrizione: "Sala per studio di gruppo e lavori collaborativi",
        isSilenziosa: false,
        isGruppi: true,
        capienzaMax: 20,
        orarioApertura: "09:00",
        orarioChiusura: "19:00",
      },
    }),
  ]);

  console.log(`   ✓ ${sale.length} sale create`);

  // ============================================
  // 4. POSTI
  // ============================================
  console.log("🪑 Creazione posti...");

  const postiCreati: Awaited<ReturnType<typeof prisma.posto.create>>[] = [];

  // Sala Studio Principale - 72 posti (12 tavoli × 6 posti)
  // Layout: 2 file (sinistra/destra), 6 tavoli per fila, 6 postazioni per tavolo
  const TAVOLI_PER_FILA = 6;
  const POSTI_PER_TAVOLO = 6;
  
  for (let filaIndex = 0; filaIndex < 2; filaIndex++) {
    // 0 = fila sinistra, 1 = fila destra
    for (let tavoloIndex = 0; tavoloIndex < TAVOLI_PER_FILA; tavoloIndex++) {
      for (let postoIndex = 0; postoIndex < POSTI_PER_TAVOLO; postoIndex++) {
        // Calcola numero progressivo A1-A6 (tavolo 1), B1-B6 (tavolo 2), etc.
        const tavoloGlobale = (filaIndex * TAVOLI_PER_FILA) + tavoloIndex;
        const letteraTavolo = String.fromCharCode(65 + tavoloGlobale); // A-L
        const numeroPosto = postoIndex + 1; // 1-6
        const numero = `${letteraTavolo}${numeroPosto}`;
        
        // Coordinate: simulate il layout tavoli
        const baseX = filaIndex === 0 ? 100 : 300; // fila sx o dx
        const baseY = tavoloIndex * 100 + 100;
        const offsetX = (postoIndex % 3) * 40; // 3 posti per lato
        const offsetY = postoIndex < 3 ? -20 : 80; // sopra o sotto tavolo
        
        const hasFinestra = tavoloIndex === 0 || tavoloIndex === 5; // primo e ultimo tavolo vicino finestre
        const isAccessibile = tavoloIndex === 0 && postoIndex < 2; // primi 2 posti del primo tavolo
        
        const posto = await prisma.posto.create({
          data: {
            salaId: sale[0].id,
            numero,
            coordinataX: baseX + offsetX,
            coordinataY: baseY + offsetY,
            haPresaElettrica: true, // TUTTI i posti hanno presa elettrica
            haFinestra: hasFinestra,
            isAccessibile,
            stato: "DISPONIBILE",
          },
        });
        postiCreati.push(posto);
      }
    }
  }

  // Sala Lettura Silenziosa - 30 postazioni individuali
  // Numerazione: S1-S30
  for (let i = 1; i <= 30; i++) {
    const numero = `S${i}`;
    const fila = Math.floor((i - 1) / 6);
    const colonna = (i - 1) % 6;
    
    const posto = await prisma.posto.create({
      data: {
        salaId: sale[1].id,
        numero,
        coordinataX: colonna * 80 + 50,
        coordinataY: fila * 100 + 50,
        haPresaElettrica: true, // tutti con presa
        haFinestra: colonna === 0 || colonna === 5,
        isAccessibile: i <= 6, // Prima fila accessibile
        stato: "DISPONIBILE",
      },
    });
    postiCreati.push(posto);
  }

  // Sala Gruppi - 20 posti (4 tavoli grandi da 5 posti ciascuno)
  // Numerazione: G1-G20
  for (let i = 1; i <= 20; i++) {
    const numero = `G${i}`;
    const posto = await prisma.posto.create({
      data: {
        salaId: sale[2].id,
        numero,
        coordinataX: 100,
        coordinataY: 100,
        haPresaElettrica: true,
        haFinestra: false,
        isAccessibile: i <= 5, // Primo tavolo accessibile
        stato: "DISPONIBILE",
      },
    });
    postiCreati.push(posto);
  }

  console.log(`   ✓ ${postiCreati.length} posti creati`);

  // ============================================
  // 5. LIBRI
  // ============================================
  console.log("📚 Creazione catalogo libri...");

  const libri = await Promise.all([
    // Informatica
    prisma.libro.create({
      data: {
        isbn: "978-0-13-468599-1",
        titolo: "Clean Code",
        autore: "Robert C. Martin",
        editore: "Pearson",
        anno: 2008,
        categoria: "Informatica",
        copieDisponibili: 3,
        copieTotali: 5,
        scaffale: "INF-A",
        piano: 1,
      },
    }),
    prisma.libro.create({
      data: {
        isbn: "978-0-201-63361-0",
        titolo: "Design Patterns",
        autore: "Gang of Four",
        editore: "Addison-Wesley",
        anno: 1994,
        categoria: "Informatica",
        copieDisponibili: 2,
        copieTotali: 4,
        scaffale: "INF-A",
        piano: 1,
      },
    }),
    prisma.libro.create({
      data: {
        isbn: "978-0-596-51774-8",
        titolo: "JavaScript: The Good Parts",
        autore: "Douglas Crockford",
        editore: "O'Reilly",
        anno: 2008,
        categoria: "Informatica",
        copieDisponibili: 4,
        copieTotali: 4,
        scaffale: "INF-B",
        piano: 1,
      },
    }),
    prisma.libro.create({
      data: {
        isbn: "978-1-491-95035-4",
        titolo: "Fluent Python",
        autore: "Luciano Ramalho",
        editore: "O'Reilly",
        anno: 2015,
        categoria: "Informatica",
        copieDisponibili: 1,
        copieTotali: 3,
        scaffale: "INF-B",
        piano: 1,
      },
    }),

    // HCI / Design
    prisma.libro.create({
      data: {
        isbn: "978-0-465-05065-9",
        titolo: "The Design of Everyday Things",
        autore: "Don Norman",
        editore: "Basic Books",
        anno: 2013,
        categoria: "Design",
        copieDisponibili: 2,
        copieTotali: 3,
        scaffale: "DES-A",
        piano: 2,
      },
    }),
    prisma.libro.create({
      data: {
        isbn: "978-0-321-76533-0",
        titolo: "Don't Make Me Think",
        autore: "Steve Krug",
        editore: "New Riders",
        anno: 2014,
        categoria: "Design",
        copieDisponibili: 3,
        copieTotali: 3,
        scaffale: "DES-A",
        piano: 2,
      },
    }),

    // Matematica
    prisma.libro.create({
      data: {
        isbn: "978-88-08-06485-1",
        titolo: "Analisi Matematica 1",
        autore: "Enrico Giusti",
        editore: "Bollati Boringhieri",
        anno: 2003,
        categoria: "Matematica",
        copieDisponibili: 5,
        copieTotali: 10,
        scaffale: "MAT-A",
        piano: 1,
      },
    }),
    prisma.libro.create({
      data: {
        isbn: "978-88-08-06486-8",
        titolo: "Analisi Matematica 2",
        autore: "Enrico Giusti",
        editore: "Bollati Boringhieri",
        anno: 2003,
        categoria: "Matematica",
        copieDisponibili: 4,
        copieTotali: 8,
        scaffale: "MAT-A",
        piano: 1,
      },
    }),

    // Fisica
    prisma.libro.create({
      data: {
        isbn: "978-88-08-18220-3",
        titolo: "Fisica Generale - Meccanica",
        autore: "Mazzoldi, Nigro, Voci",
        editore: "EdiSES",
        anno: 2008,
        categoria: "Fisica",
        copieDisponibili: 6,
        copieTotali: 8,
        scaffale: "FIS-A",
        piano: 2,
      },
    }),
    prisma.libro.create({
      data: {
        isbn: "978-88-08-18221-0",
        titolo: "Fisica Generale - Elettromagnetismo",
        autore: "Mazzoldi, Nigro, Voci",
        editore: "EdiSES",
        anno: 2008,
        categoria: "Fisica",
        copieDisponibili: 5,
        copieTotali: 7,
        scaffale: "FIS-A",
        piano: 2,
      },
    }),
  ]);

  console.log(`   ✓ ${libri.length} libri creati`);

  // ============================================
  // 6. PRENOTAZIONI (alcune attive + scenari test automazioni)
  // ============================================
  console.log("📅 Creazione prenotazioni...");

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  const domani = new Date(oggi);
  domani.setDate(domani.getDate() + 1);

  // Helper per creare orari come Time (solo ora)
  const makeTime = (ore: number, minuti: number = 0): Date => {
    const d = new Date(1970, 0, 1, ore, minuti, 0, 0);
    return d;
  };

  // Calcola un orario tra 10 e 20 minuti nel futuro per test reminder
  const oraCorrente = new Date();
  const minutiAttuali = oraCorrente.getMinutes();
  const minutiFuturo = minutiAttuali + 12; // tra 12 minuti
  const oraReminderTest = makeTime(oraCorrente.getHours(), minutiFuturo % 60);

  // Calcola un orario di 30 minuti fa per test no-show
  const minutiPassati = minutiAttuali - 30;
  const oraNoShowTest = makeTime(
    oraCorrente.getHours() + (minutiPassati < 0 ? -1 : 0),
    (minutiPassati + 60) % 60
  );

  const prenotazioni = await Promise.all([
    // Mario ha una prenotazione attiva oggi con check-in effettuato
    prisma.prenotazione.create({
      data: {
        userId: studenti[0].id,
        postoId: postiCreati[0].id, // A1
        data: oggi,
        oraInizio: makeTime(9, 0),
        oraFine: makeTime(13, 0),
        stato: "CHECK_IN",
        checkInAt: new Date(oggi.getTime() + 9 * 60 * 60 * 1000),
        marginePendolare: true,
        minutiMarginePendolare: 30,
      },
    }),
    // Laura ha prenotato per domani
    prisma.prenotazione.create({
      data: {
        userId: studenti[1].id,
        postoId: postiCreati[10].id, // B1
        data: domani,
        oraInizio: makeTime(14, 0),
        oraFine: makeTime(18, 0),
        stato: "CONFERMATA",
      },
    }),
    // Giuseppe ha una prenotazione confermata per oggi pomeriggio
    prisma.prenotazione.create({
      data: {
        userId: studenti[2].id,
        postoId: postiCreati[50].id, // Sala silenziosa S11
        data: oggi,
        oraInizio: makeTime(15, 0),
        oraFine: makeTime(19, 0),
        stato: "CONFERMATA",
      },
    }),
    // 🧪 TEST AUTOMATION 1: Anna ha prenotazione tra 12 min (test REMINDER)
    prisma.prenotazione.create({
      data: {
        userId: studenti[3].id, // Anna
        postoId: postiCreati[20].id,
        data: oggi,
        oraInizio: oraReminderTest,
        oraFine: makeTime((oraCorrente.getHours() + 2) % 24, 0),
        stato: "CONFERMATA",
      },
    }),
    // 🧪 TEST AUTOMATION 2: Luca ha prenotazione 30 min fa senza check-in (test NO-SHOW)
    prisma.prenotazione.create({
      data: {
        userId: studenti[4].id, // Luca
        postoId: postiCreati[30].id,
        data: oggi,
        oraInizio: oraNoShowTest,
        oraFine: makeTime((oraCorrente.getHours() + 2) % 24, 0),
        stato: "CONFERMATA",
      },
    }),
  ]);

  // Aggiorna stato posto occupato per Mario
  await prisma.posto.update({
    where: { id: postiCreati[0].id },
    data: { stato: "OCCUPATO" },
  });

  console.log(`   ✓ ${prenotazioni.length} prenotazioni create`);

  // ============================================
  // 7. PRESTITI (alcuni con scadenze vicine per test)
  // ============================================
  console.log("📖 Creazione prestiti...");

  const settimanaFa = new Date(oggi);
  settimanaFa.setDate(settimanaFa.getDate() - 7);

  const ieri = new Date(oggi);
  ieri.setDate(ieri.getDate() - 1);

  const traUnMese = new Date(oggi);
  traUnMese.setDate(traUnMese.getDate() + 30);

  const tra2Giorni = new Date(oggi);
  tra2Giorni.setDate(tra2Giorni.getDate() + 2);

  const prestiti = await Promise.all([
    // Mario ha in prestito Clean Code
    prisma.prestito.create({
      data: {
        userId: studenti[0].id,
        libroId: libri[0].id,
        dataPrestito: settimanaFa,
        dataScadenza: traUnMese,
        stato: "ATTIVO",
      },
    }),
    // Laura ha in prestito Design of Everyday Things
    prisma.prestito.create({
      data: {
        userId: studenti[1].id,
        libroId: libri[4].id,
        dataPrestito: ieri,
        dataScadenza: new Date(ieri.getTime() + 30 * 24 * 60 * 60 * 1000),
        stato: "ATTIVO",
      },
    }),
    // Giuseppe ha restituito un libro
    prisma.prestito.create({
      data: {
        userId: studenti[2].id,
        libroId: libri[6].id,
        dataPrestito: new Date(oggi.getTime() - 20 * 24 * 60 * 60 * 1000),
        dataScadenza: new Date(oggi.getTime() + 10 * 24 * 60 * 60 * 1000),
        dataRestituzione: ieri,
        stato: "RESTITUITO",
      },
    }),
    // 🧪 TEST AUTOMATION 3: Anna ha prestito in scadenza tra 2 giorni (test ALERT SCADENZA)
    prisma.prestito.create({
      data: {
        userId: studenti[3].id, // Anna
        libroId: libri[8].id, // Fisica
        dataPrestito: new Date(oggi.getTime() - 28 * 24 * 60 * 60 * 1000),
        dataScadenza: tra2Giorni,
        stato: "ATTIVO",
      },
    }),
  ]);

  console.log(`   ✓ ${prestiti.length} prestiti creati`);

  // ============================================
  // 8. NOTIFICHE
  // ============================================
  console.log("🔔 Creazione notifiche...");

  const notifiche = await Promise.all([
    prisma.notifica.create({
      data: {
        userId: studenti[0].id,
        tipo: "PRENOTAZIONE",
        titolo: "Prenotazione confermata",
        messaggio: "La tua prenotazione per il posto A1 è stata confermata per oggi dalle 09:00 alle 13:00.",
        letta: true,
        actionUrl: "/prenotazioni",
        actionLabel: "Vedi prenotazione",
      },
    }),
    prisma.notifica.create({
      data: {
        userId: studenti[0].id,
        tipo: "SCADENZA_PRESTITO",
        titolo: "Promemoria scadenza prestito",
        messaggio: "Il prestito del libro 'Clean Code' scade tra 23 giorni. Ricorda di restituirlo o rinnovarlo.",
        letta: false,
        actionUrl: "/prestiti",
        actionLabel: "Gestisci prestiti",
      },
    }),
    prisma.notifica.create({
      data: {
        userId: studenti[0].id,
        tipo: "SISTEMA",
        titolo: "Benvenuto in BiblioFlow!",
        messaggio: "Grazie per esserti registrato. Esplora le funzionalità e prenota il tuo primo posto in biblioteca.",
        letta: false,
        actionUrl: "/prenota",
        actionLabel: "Prenota ora",
      },
    }),
    prisma.notifica.create({
      data: {
        userId: studenti[0].id,
        tipo: "PROMO",
        titolo: "Nuovi orari biblioteca",
        messaggio: "Da questo mese la biblioteca è aperta anche il sabato mattina dalle 9:00 alle 13:00.",
        letta: false,
      },
    }),
    prisma.notifica.create({
      data: {
        userId: studenti[0].id,
        tipo: "CHECK_IN_REMINDER",
        titolo: "Ricorda di fare check-in",
        messaggio: "La tua prenotazione inizia tra 15 minuti. Ricorda di effettuare il check-in!",
        letta: false,
        actionUrl: "/prenotazioni",
        actionLabel: "Fai check-in",
      },
    }),
    prisma.notifica.create({
      data: {
        userId: studenti[1].id,
        tipo: "PRENOTAZIONE",
        titolo: "Prenotazione confermata",
        messaggio: "La tua prenotazione per domani è stata confermata.",
        letta: false,
        actionUrl: "/prenotazioni",
        actionLabel: "Vedi prenotazione",
      },
    }),
  ]);

  console.log(`   ✓ ${notifiche.length} notifiche create`);

  // ============================================
  // 9. LOG EVENTI
  // ============================================
  console.log("📋 Creazione log eventi...");

  const logEventi = await Promise.all([
    prisma.logEvento.create({
      data: {
        tipo: "PRENOTAZIONE_CREATA",
        userId: studenti[0].id,
        prenotazioneId: prenotazioni[0].id,
        descrizione: "Prenotazione creata per posto A1",
      },
    }),
    prisma.logEvento.create({
      data: {
        tipo: "CHECK_IN",
        userId: studenti[0].id,
        prenotazioneId: prenotazioni[0].id,
        descrizione: "Check-in effettuato alle 09:00",
      },
    }),
    prisma.logEvento.create({
      data: {
        tipo: "PRESTITO_CREATO",
        userId: studenti[0].id,
        descrizione: "Prestito libro 'Clean Code'",
      },
    }),
  ]);

  console.log(`   ✓ ${logEventi.length} log eventi creati`);

  // ============================================
  // RIEPILOGO
  // ============================================
  console.log("\n" + "=".repeat(50));
  console.log("✅ SEED COMPLETATO CON SUCCESSO!");
  console.log("=".repeat(50));
  console.log(`
📊 Riepilogo dati creati:
   👤 Utenti:       ${studenti.length + bibliotecari.length} (${studenti.length} studenti + ${bibliotecari.length} staff)
   🏛️ Sale:         ${sale.length}
   🪑 Posti:        ${postiCreati.length}
   📚 Libri:        ${libri.length}
   📅 Prenotazioni: ${prenotazioni.length} (🧪 2 per test automazioni)
   📖 Prestiti:     ${prestiti.length} (🧪 1 per test scadenza)
   🔔 Notifiche:    ${notifiche.length}
   📋 Log Eventi:   ${logEventi.length}

🔑 Utenti di test:
   Email: mario.rossi@studenti.unisa.it (Studente con prenotazione attiva)
   Password: password123
   
   Email: anna.neri@studenti.unisa.it (🧪 TEST AUTOMATIONS - ha prenotazione tra 12 min + prestito in scadenza)
   Password: password123
   
   Email: luca.ferrari@studenti.unisa.it (🧪 TEST NO-SHOW - prenotazione 30 min fa senza check-in)
   Password: password123
   
   Email: admin@biblioteca.unisa.it (Admin)
   Password: admin123

🧪 TEST AUTOMAZIONI:
   1. Chiama: curl -X POST http://localhost:3000/api/cron/automations \\
              -H "Authorization: Bearer ${process.env.CRON_SECRET}"
   2. Login come Anna (anna.neri@studenti.unisa.it) e vedi notifiche
   3. Login come Luca (luca.ferrari@studenti.unisa.it) - la sua prenotazione sarà cancellata per no-show

🔍 Scanner QR:
   - Accedi come bibliotecario e vai su /admin/scanner
   - Scansiona i QR generati dagli studenti

🌐 Per visualizzare i dati:
   npx prisma studio
`);
}

main()
  .catch((e) => {
    console.error("❌ Errore durante il seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
