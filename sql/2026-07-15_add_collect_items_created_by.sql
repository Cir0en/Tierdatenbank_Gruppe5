-- Speichert, welcher Nutzer ein collect_items-Objekt (Tier) angelegt hat.
-- Grundlage für die Lösch-Berechtigung "nur Admin, Moderator oder Ersteller"
-- in AnimalsController.DeleteAnimal.
--
-- Manuell gegen die Neon-Datenbank ausführen (kein EF-Core-Migrationsprojekt
-- vorhanden, das dies automatisch anwenden würde).
ALTER TABLE collect_items
    ADD COLUMN IF NOT EXISTS created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_collect_items_created_by ON collect_items(created_by_user_id);
