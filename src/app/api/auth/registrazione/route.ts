// ============================================
// API REGISTRAZIONE - BiblioFlow
// ============================================
// Gestisce la registrazione di nuovi utenti
// Basato sui requisiti HCI:
// - Inclusività by design (supporto accessibilità)
// - Flessibilità adattiva (profilo pendolare)

// Forza Node.js runtime (bcryptjs e prisma non funzionano su Edge)
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, validatePassword } from "@/lib/auth";
import { registrationRateLimiter } from "@/lib/rate-limit";
import { generateRawToken, hashToken } from "@/lib/auth-tokens";
import { emailVerifica, inviaEmail, urlVerificaEmail } from "@/lib/mailer";
import { env } from "@/lib/env";
import { z } from "zod";

// Schema di validazione registrazione
const registrazioneSchema = z.object({
  email: z
    .string()
    .email("Email non valida")
    .transform((e) => e.toLowerCase()),
  password: z.string().min(8, "Password deve avere almeno 8 caratteri"),
  confermaPassword: z.string(),
  nome: z.string().min(2, "Nome deve avere almeno 2 caratteri"),
  cognome: z.string().min(2, "Cognome deve avere almeno 2 caratteri"),
  // Matricola opzionale: se fornita deve essere esattamente 10 cifre
  matricola: z.string().optional().refine(
    (val) => !val || val.trim() === "" || /^\d{10}$/.test(val),
    { message: "La matricola deve contenere esattamente 10 cifre" }
  ),
  
  // Profilo pendolare (Flessibilità adattiva - HCI)
  isPendolare: z.boolean().default(false),
  cittaResidenza: z.string().optional(),
  mezzoTrasporto: z.string().optional(),
  tempoPercorrenza: z.string().optional(),
  
  // Accessibilità (Inclusività by design - HCI)
  necessitaAccessibilita: z.boolean().default(false),
  tipoAccessibilita: z.string().optional(),
  altreNote: z.string().optional(),
  
  // Preferenze notifiche (opzionali)
  notifichePush: z.boolean().optional().default(true),
  notificheEmail: z.boolean().optional().default(true),
}).refine((data) => data.password === data.confermaPassword, {
  message: "Le password non corrispondono",
  path: ["confermaPassword"],
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: solo VERIFICA, senza incrementare il contatore.
    //
    // PERCHE': prima ogni chiamata consumava un tentativo, comprese quelle
    // rifiutate subito dopo per dati non validi. Bastavano quindi tre errori
    // di battitura per restare bloccati un'ora senza aver creato nulla.
    // L'incremento avviene ora a fondo funzione, quando l'account esiste
    // davvero, cosi' il limite misura le registrazioni effettive.
    const rateLimitResult = await registrationRateLimiter(request, "verifica");
    if (rateLimitResult) return rateLimitResult;
    
    const body = await request.json();
    
    // Valida i dati di input
    const validationResult = registrazioneSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Dati non validi",
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }
    
    const data = validationResult.data;
    
    // Valida la forza della password
    const passwordValidation = validatePassword(data.password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: "Password non sufficientemente sicura",
          details: { password: passwordValidation.errors },
        },
        { status: 400 }
      );
    }
    
    // Verifica se l'email è già registrata
    const existingEmail = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingEmail) {
      return NextResponse.json(
        {
          success: false,
          error: "Questa email è già registrata",
        },
        { status: 409 }
      );
    }
    
    // Verifica se la matricola è già registrata (se fornita e non vuota)
    if (data.matricola && data.matricola.trim() !== "") {
      const existingMatricola = await prisma.user.findUnique({
        where: { matricola: data.matricola },
      });
      if (existingMatricola) {
        return NextResponse.json(
          {
            success: false,
            error: "Questa matricola è già registrata",
          },
          { status: 409 }
        );
      }
    }
    
    // Hash della password
    const passwordHash = await hashPassword(data.password);
    
    // Costruisci il tragitto pendolare se i dati sono forniti
    let tragittoPendolare = null;
    if (data.isPendolare && (data.cittaResidenza || data.mezzoTrasporto || data.tempoPercorrenza)) {
      const parts = [];
      if (data.cittaResidenza) parts.push(`Da: ${data.cittaResidenza}`);
      if (data.mezzoTrasporto) parts.push(`Mezzo: ${data.mezzoTrasporto}`);
      if (data.tempoPercorrenza) parts.push(`Tempo: ${data.tempoPercorrenza} min`);
      tragittoPendolare = parts.join(" | ");
    }
    
    // Costruisci le preferenze accessibilità
    let preferenzeAccessibilita = null;
    if (data.necessitaAccessibilita && (data.tipoAccessibilita || data.altreNote)) {
      const parts = [];
      if (data.tipoAccessibilita) parts.push(data.tipoAccessibilita);
      if (data.altreNote) parts.push(data.altreNote);
      preferenzeAccessibilita = parts.join(" - ");
    }
    
    // Crea l'utente
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        nome: data.nome,
        cognome: data.cognome,
        matricola: (data.matricola && data.matricola.trim() !== "") ? data.matricola : null,
        ruolo: "STUDENTE", // Default role per nuovi utenti
        isPendolare: data.isPendolare,
        tragittoPendolare,
        necessitaAccessibilita: data.necessitaAccessibilita,
        preferenzeAccessibilita,
        altoContrasto: false, // Default false, può essere cambiato in seguito
        notifichePush: data.notifichePush ?? true,
        notificheEmail: data.notificheEmail ?? true,
        emailVerificata: false, // Richiede verifica email
        attivo: true,
      },
      select: {
        id: true,
        email: true,
        nome: true,
        cognome: true,
        matricola: true,
        ruolo: true,
        isPendolare: true,
        necessitaAccessibilita: true,
        createdAt: true,
      },
    });
    
    // Crea notifica di benvenuto
    await prisma.notifica.create({
      data: {
        userId: user.id,
        tipo: "SISTEMA",
        titolo: "Benvenuto in BiblioFlow! 📚",
        messaggio: `Ciao ${user.nome}, il tuo account è stato creato con successo. Esplora le sale studio e prenota il tuo posto preferito!`,
        actionUrl: "/dashboard",
        actionLabel: "Vai alla dashboard",
      },
    });
    
    // Log evento registrazione
    await prisma.logEvento.create({
      data: {
        tipo: "PRENOTAZIONE_CREATA", // Usiamo questo tipo generico per ora
        userId: user.id,
        descrizione: `Nuovo utente registrato: ${user.email}`,
      },
    });
    
    // Crea token di verifica persistente.
    // Token casuale da CSPRNG (256 bit) al posto di `Math.random()`, e nel
    // database va solo il suo digest SHA-256 (finding C-2, vedi lib/auth-tokens).
    const verificationToken = generateRawToken();
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 ore

    await prisma.authToken.create({
      data: {
        userId: user.id,
        token: hashToken(verificationToken),
        type: "VERIF",
        expiresAt: expires,
      },
    });

    // L'account esiste: adesso il tentativo va contato (vedi la nota sulla
    // sola verifica a inizio funzione). Sta dopo la `create` perche' il
    // limite deve misurare gli account realmente creati.
    await registrationRateLimiter(request, "conta");

    // Recapito del link di verifica.
    //
    // PERCHE' E' IL PASSAGGIO CRUCIALE: il login rifiuta gli account con
    // `emailVerificata: false` (finding A-5) e il token non viene restituito al
    // client in produzione (finding C-1). Senza questo invio l'utente appena
    // registrato non avrebbe alcun modo di verificarsi, e quindi non potrebbe
    // MAI accedere: e' esattamente il vicolo cieco che questa modifica chiude.
    //
    // `inviaEmail` non lancia mai: se il provider e' irraggiungibile la
    // registrazione resta valida (l'account e' gia' creato) e lo comunichiamo
    // al client, che offrira' il rinvio invece di far sparire l'errore.
    const esitoInvio = await inviaEmail({
      to: user.email,
      ...emailVerifica(user.nome, urlVerificaEmail(user.id, verificationToken)),
    });

    if (!esitoInvio.inviata) {
      console.error(
        `[registrazione] Email di verifica non inviata a ${user.email}:`,
        esitoInvio.motivo,
        esitoInvio.dettaglio ?? "",
      );
    }

    const datiRisposta = {
      user: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        cognome: user.cognome,
        nomeCompleto: `${user.nome} ${user.cognome}`,
      },
      // Il client usa questo flag per dire all'utente se deve controllare la
      // posta o se invece deve richiedere il messaggio piu' tardi.
      emailVerificaInviata: esitoInvio.inviata,
    };

    // In produzione il token di verifica NON viene restituito al client
    // (finding C-1): esporlo permetterebbe a chiunque registri un indirizzo
    // altrui di auto-verificarlo, vanificando la verifica dell'email.
    // In sviluppo lo restituiamo per poter completare il flusso anche quando
    // non e' configurato nessun backend di posta.
    if (env.NODE_ENV === "production") {
      return NextResponse.json(
        {
          success: true,
          message: "Registrazione completata con successo",
          data: datiRisposta,
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Registrazione completata con successo",
        data: {
          ...datiRisposta,
          verification: {
            token: verificationToken,
            link: urlVerificaEmail(user.id, verificationToken),
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Errore registrazione:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Errore durante la registrazione",
      },
      { status: 500 }
    );
  }
}
