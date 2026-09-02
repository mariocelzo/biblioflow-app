-- Sicurezza: abilita Row Level Security su tutte le tabelle dello schema "public".
--
-- Supabase espone lo schema "public" via PostgREST (Data API) con la chiave anon.
-- Senza RLS, chiunque abbia la anon key potrebbe leggere/scrivere direttamente le
-- tabelle (es. GET /rest/v1/User). L'applicazione NON usa il client Supabase/PostgREST:
-- accede solo via Prisma con connessione diretta al ruolo "postgres" (owner), che
-- BYPASSA la RLS. Quindi abilitare la RLS senza policy blocca l'API pubblica senza
-- toccare in alcun modo l'applicazione.
--
-- NB: si usa solo ENABLE (non FORCE): FORCE applicherebbe la RLS anche all'owner e
-- romperebbe le query di Prisma.

ALTER TABLE "public"."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Sala" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Posto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Prenotazione" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ListaAttesa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Libro" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Prestito" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Notifica" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."LogEvento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ConfigurazioneSistema" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AuthToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."RichiestaPreparazione" ENABLE ROW LEVEL SECURITY;
