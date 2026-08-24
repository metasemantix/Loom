PRAGMA foreign_keys = OFF;

CREATE TABLE participants_account_lifecycle_new (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  public_slug TEXT UNIQUE,
  created_at TEXT,
  withdrawn_at TEXT,
  account_state TEXT NOT NULL DEFAULT 'active' CHECK(account_state IN ('active', 'deletion_pending', 'deleted')),
  provenance_identifier TEXT NOT NULL,
  deletion_due_at TEXT,
  deletion_finalized_at TEXT,
  CHECK(account_state = 'deleted' OR (user_id IS NOT NULL AND public_slug IS NOT NULL AND created_at IS NOT NULL)),
  CHECK(account_state != 'deleted' OR (user_id IS NULL AND public_slug IS NULL AND created_at IS NULL AND withdrawn_at IS NULL))
);
INSERT INTO participants_account_lifecycle_new
  SELECT id,user_id,public_slug,created_at,withdrawn_at,account_state,provenance_identifier,deletion_due_at,deletion_finalized_at
  FROM participants;
DROP TABLE participants;
ALTER TABLE participants_account_lifecycle_new RENAME TO participants;
CREATE UNIQUE INDEX participants_provenance_identifier ON participants(provenance_identifier);

CREATE TRIGGER participants_require_provenance_identifier
BEFORE INSERT ON participants
WHEN NEW.provenance_identifier IS NULL OR NEW.provenance_identifier=''
BEGIN
  SELECT RAISE(ABORT, 'participant provenance identifier is required');
END;
CREATE TRIGGER participants_provenance_identifier_immutable
BEFORE UPDATE OF provenance_identifier ON participants
WHEN NEW.provenance_identifier IS NOT OLD.provenance_identifier
BEGIN
  SELECT RAISE(ABORT, 'participant provenance identifier is immutable');
END;

PRAGMA foreign_keys = ON;
