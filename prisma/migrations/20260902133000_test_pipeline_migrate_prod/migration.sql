-- Migrazione di prova per verificare il workflow migrate-prod.yml.
-- Aggiunge solo un COMMENT sulla tabella: nessun impatto su dati o comportamento,
-- lock trascurabile (SHARE UPDATE EXCLUSIVE), reversibile con: COMMENT ON TABLE ... IS NULL;

COMMENT ON TABLE "public"."ListaAttesa" IS 'Lista d''attesa per posto e intervallo — CR-BF-01 Fase 2 (BIB-23). Commento aggiunto come smoke-test della pipeline di deploy migrazioni.';
