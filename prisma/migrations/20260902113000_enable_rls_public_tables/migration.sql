-- Sicurezza: abilita Row Level Security su tutte le tabelle dello schema "public".
--
-- Supabase espone lo schema "public" via PostgREST (Data API) con la chiave anon.
-- Senza RLS, chiunque abbia la anon key potrebbe leggere/scrivere direttamente le
-- tabelle (es. GET /rest/v1/User). L'applicazione NON usa il client Supabase/PostgREST:
-- accede solo via Prisma con connessione diretta al ruolo owner, che BYPASSA la RLS.
-- Abilitare la RLS senza policy blocca l'API pubblica senza toccare l'applicazione.
--
-- NB1: solo ENABLE (non FORCE): FORCE applicherebbe la RLS anche all'owner e
--      romperebbe le query di Prisma.
-- NB2: si itera con controllo di esistenza perche' "RichiestaPreparazione" e'
--      presente in schema.prisma ma priva di migrazione dedicata (drift storico):
--      su un DB creato con `migrate deploy` non esiste, con `db push` si'.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'User', 'Sala', 'Posto', 'Prenotazione', 'ListaAttesa', 'Libro', 'Prestito',
    'Notifica', 'LogEvento', 'ConfigurazioneSistema', 'AuthToken', 'RichiestaPreparazione'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END
$$;
