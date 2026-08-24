PRAGMA foreign_keys = ON;

ALTER TABLE participants ADD COLUMN account_state TEXT NOT NULL DEFAULT 'active'
  CHECK(account_state IN ('active', 'deletion_pending', 'deleted'));
ALTER TABLE participants ADD COLUMN provenance_identifier TEXT;
ALTER TABLE participants ADD COLUMN deletion_due_at TEXT;
ALTER TABLE participants ADD COLUMN deletion_finalized_at TEXT;

UPDATE participants SET provenance_identifier='legacy-user-' || substr(public_slug, 5);
CREATE UNIQUE INDEX participants_provenance_identifier
  ON participants(provenance_identifier);

CREATE TABLE account_events (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(event_type IN ('account_deletion_scheduled','account_deletion_cancelled','account_deletion_finalized')),
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX account_events_participant ON account_events(participant_id, created_at);

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
