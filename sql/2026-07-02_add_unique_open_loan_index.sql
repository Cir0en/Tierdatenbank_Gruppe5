-- Verhindert, dass ein Objekt (loans.object_id) gleichzeitig mehr als eine
-- offene Leihe (status = 'offen') hat. Schließt die Race Condition, bei der
-- zwei parallele POST /api/loan-Requests dasselbe Objekt doppelt verleihen.
--
-- Manuell gegen die Neon-Datenbank ausführen (kein EF-Core-Migrationsprojekt
-- vorhanden, das dies automatisch anwenden würde).
CREATE UNIQUE INDEX IF NOT EXISTS idx_loans_object_open_unique
ON loans (object_id)
WHERE status = 'offen';
