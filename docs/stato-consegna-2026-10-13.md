# BiblioFlow — stato della consegna al 13 ottobre 2026

## Esito sintetico

La candidata alla consegna integra il contenuto delle PR #82 e #83 sulla base
`main` `59a0d54` e chiude i punti emersi dall'ultima revisione tecnica e
documentale. Il codice locale verificato non contiene errori bloccanti noti.

## Modifiche incluse

- rate limiting collegato a tutte le route interattive di scrittura; il cron
  resta protetto separatamente da `CRON_SECRET`;
- completamento automatico delle prenotazioni `CHECK_IN` al termine della fascia;
- disponibilita' calcolata sull'intervallo richiesto, non sul solo stato globale;
- cancellazioni e automazioni non sovrascrivono un posto in `MANUTENZIONE`;
- aggiornamento a Next.js 16.4.0 e dipendenze transitive corrette per rimuovere
  le vulnerabilita' note dal bundle di produzione;
- controlli React aggiornati e frontend allineato alle regole correnti;
- rimozione dai documenti finali dei riferimenti SSE non piu' presenti;
- README, variabili ambiente, diagrammi TO-BE e report finale riallineati.

## Verifica eseguita

| Controllo | Esito |
| --- | :---: |
| Migrazioni su PostgreSQL 16 isolato | PASS — 8/8 applicate |
| Suite completa | PASS — 102/102 file, 758/758 test |
| Test unitari | PASS — 79/79 file, 623/623 test |
| ESLint | PASS — 0 errori, 0 warning |
| TypeScript `--noEmit` | PASS |
| Build Next.js di produzione | PASS |
| `npm audit --omit=dev` | PASS — 0 vulnerabilita' di produzione |

I file di test sono eseguiti in sequenza perché i test d'integrazione usano lo
stesso database PostgreSQL: questo evita che un'automazione globale elabori la
fixture di un altro file durante una corsa parallela.

## Configurazione operativa verificata

- applicazione pubblica raggiungibile su Vercel;
- workflow cron GitHub eseguito con successo il 13 ottobre 2026;
- `CRON_SECRET` quindi presente nell'ambiente remoto;
- repository GitHub pubblico e pipeline di `main` verde all'ultima verifica;
- in produzione Brevo ha priorita' su Resend se entrambe le chiavi sono presenti.

## Limiti dichiarati

1. Il rate limiter usa memoria locale per istanza. E' adatto a mitigare abuso
   evidente, ma non costituisce una quota globale su piu' istanze serverless.
2. `npm audit` segnala ancora 5 voci high riconducibili a un unico advisory
   nella sola catena di sviluppo ESLint (`fast-glob`/`micromatch`/`braces`).
   Il resolver propone un downgrade incompatibile a `eslint-config-next`
   14.2.35; la dipendenza non entra nel bundle di produzione.
3. Le credenziali staff create dal seed remoto risultavano inattive durante la
   verifica: per una demo pubblica vanno usati account esplicitamente attivati,
   senza modificare silenziosamente gli account di produzione.
## Passi di pubblicazione

1. pubblicare il branch di consegna e ottenere la revisione richiesta dalla
   protezione di `main`;
2. unire la candidata e attendere CI e deploy Vercel verdi;
3. verificare il successivo cron: le due prenotazioni `CHECK_IN` storiche devono
   passare a `COMPLETATA` senza riaprire posti in manutenzione;
4. allegare il pacchetto finale, che include il foglio Excel del corso con i dati
   verificati di tutti e tre i partecipanti;
5. chiudere BIB-67 e l'epic BIB-8 solo dopo il controllo degli allegati.
