-- Erweitert den Ausleih-Workflow um Anfragen: Nutzer können künftig eine
-- Ausleihe für ein fremdes Objekt *anfragen* (status 'angefragt'), der
-- Verleiher bestätigt ('offen') oder lehnt ab ('abgelehnt'). Der bisherige
-- direkte Verleih durch den Eigentümer bleibt unverändert (legt sofort
-- status 'offen' an).
--
-- loans.status hat bereits eine CHECK-Constraint, die nur die bisherigen
-- Werte ('offen', 'zurückgegeben') erlaubt hat. Da es kein EF-Core-
-- Migrationsprojekt gibt (siehe sql/2026-07-02_add_unique_open_loan_index.sql),
-- wird sie hier dynamisch gesucht und durch eine erweiterte Fassung ersetzt.
--
-- Manuell gegen die Neon-Datenbank ausführen.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'loans' AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%status%'
    LOOP
        EXECUTE format('ALTER TABLE loans DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

ALTER TABLE loans
    ADD CONSTRAINT loans_status_check
    CHECK (status IN ('angefragt', 'offen', 'abgelehnt', 'zurückgegeben'));
