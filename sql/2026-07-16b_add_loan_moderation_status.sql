-- Fügt eine zweite, vom Verleiher unabhängige Freigabestufe durch Moderator/Admin hinzu, bevor
-- eine Leihe aktiv wird: neuer Zwischenstatus 'in_pruefung'. Sowohl der direkte Verleih durch den
-- Eigentümer als auch eine vom Verleiher bestätigte Anfrage landen jetzt zunächst hier, statt sofort
-- auf 'offen' zu springen (siehe LoanController.CreateLoan / ApproveLoanRequest / ModerateApprove).
--
-- Baut auf sql/2026-07-16_add_loan_request_status.sql auf, ist aber unabhängig davon idempotent
-- ausführbar (sucht/ersetzt die CHECK-Constraint erneut dynamisch).
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
    CHECK (status IN ('angefragt', 'in_pruefung', 'offen', 'abgelehnt', 'zurückgegeben'));

-- Der bisherige Unique-Index verhinderte nur zwei gleichzeitig *aktive* ('offen') Leihen für
-- dasselbe Objekt. Da ein Objekt jetzt schon während der Moderationsprüfung ('in_pruefung')
-- reserviert ist, muss der Index diesen Status ebenfalls abdecken.
DROP INDEX IF EXISTS idx_loans_object_open_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_loans_object_open_unique
ON loans (object_id)
WHERE status IN ('offen', 'in_pruefung');
