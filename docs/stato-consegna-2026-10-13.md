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

## Verifica indipendente prima del merge

Ripetuta il 13 ottobre 2026 sul commit `066f198` della PR #84, su una macchina
Windows 11 con Node 22.12, Docker 29.1 e il servizio `postgres-test`
(PostgreSQL 16, `127.0.0.1:5433`), senza riutilizzare l'ambiente della prima
verifica.

| Controllo | Esito |
| --- | :---: |
| `npm run test:db:prepare` | PASS — 8/8 migrazioni; `prisma db push` non rileva differenze dallo schema |
| `npm test` (suite ufficiale) | PASS — 102/102 file, 758/758 test |
| `npm run lint` | PASS — 0 errori, 0 warning |
| `npx tsc --noEmit` | PASS |
| `npm audit --omit=dev --audit-level=high` | PASS — 0 vulnerabilita' |
| CI GitHub sul commit `066f198` | PASS — lint, typecheck, build, test, audit, GitGuardian |
| Foglio del corso | Completo nei fogli `progetto` e `partecipanti`; SHA-256 coincidente con il manifest |

I test di caratterizzazione `tests/pre-modifica/**`, eseguiti a parte sul
codice TO-BE, terminano con 12 casi superati, 12 falliti e 6 saltati su 30. E'
l'esito atteso e gia' motivato nel report di regressione: quei casi descrivono
il comportamento della baseline, sono esclusi da `npm test` e i fallimenti
corrispondono ai casi classificati MODIFICATI, non a regressioni.

Rispetto alle linee guida del corso i documenti richiesti sono tutti presenti:

| Richiesta del corso | Documento di consegna |
| --- | --- |
| Report di analisi, progettazione e realizzazione con processo di impact analysis e diagrammi | `01 - Report finale CR-BF-01` (diagrammi AS-IS e TO-BE nelle Appendici A e B) |
| Specifica dei casi di test prima della modifica | `02 - Specifica dei casi di test pre-modifica` |
| Report di esecuzione dei test prima della modifica | `03 - Report di esecuzione dei test pre-modifica` |
| Specifica dei casi di test dopo la modifica, con casi aggiunti, eliminati, modificati e invariati | `04 - Specifica dei casi di test post-modifica` |
| Esecuzione dei test sulle parti aggiunte o modificate | `05 - Report dei test sulle parti modificate` |
| Esecuzione dei test sulle parti non modificate (regressione) | `06 - Report dei test di regressione` |
| File Excel con informazioni su progetto e partecipanti | `02.Informazioni progetto ISTA - BiblioFlow.xlsx` |

I sei documenti sono generati dai sorgenti in `docs/` con
`scripts/consegna/genera_documenti.py` e versionati in PDF e Word nella cartella
`deliverables/BiblioFlow-CR-BF-01-consegna-2026-10-13/documenti/`.

## Passi di pubblicazione

1. pubblicare il branch di consegna e ottenere la revisione richiesta dalla
   protezione di `main`;
2. unire la candidata e attendere CI e deploy Vercel verdi;
3. verificare il successivo cron: le due prenotazioni `CHECK_IN` storiche devono
   passare a `COMPLETATA` senza riaprire posti in manutenzione;
4. allegare il pacchetto finale, che include il foglio Excel del corso con i dati
   verificati di tutti e tre i partecipanti;
5. chiudere BIB-67 e l'epic BIB-8 solo dopo il controllo degli allegati.
