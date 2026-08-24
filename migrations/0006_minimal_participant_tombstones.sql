PRAGMA defer_foreign_keys = ON;

CREATE TABLE participants_new (
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
INSERT INTO participants_new SELECT id,user_id,public_slug,created_at,withdrawn_at,account_state,provenance_identifier,deletion_due_at,deletion_finalized_at FROM participants;

CREATE TABLE projects_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by_participant_id TEXT NOT NULL REFERENCES participants_new(id) ON DELETE RESTRICT,
  read_audience TEXT NOT NULL CHECK(read_audience IN ('members_and_agents', 'agents_only')),
  created_at TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  lifecycle_state TEXT NOT NULL DEFAULT 'active' CHECK(lifecycle_state IN ('active', 'archived')),
  archived_at TEXT,
  archived_by_participant_id TEXT REFERENCES participants_new(id) ON DELETE SET NULL,
  lifecycle_transition_id TEXT
);
INSERT INTO projects_new SELECT id,name,created_by_participant_id,read_audience,created_at,description,lifecycle_state,archived_at,archived_by_participant_id,lifecycle_transition_id FROM projects;

CREATE TABLE project_members_new (
  project_id TEXT NOT NULL REFERENCES projects_new(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participants_new(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY(project_id, participant_id)
);
INSERT INTO project_members_new SELECT * FROM project_members;

CREATE TABLE project_documents_new (
  project_id TEXT NOT NULL REFERENCES projects_new(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  source_owner_participant_id TEXT NOT NULL REFERENCES participants_new(id) ON DELETE RESTRICT,
  added_by_participant_id TEXT NOT NULL REFERENCES participants_new(id) ON DELETE RESTRICT,
  added_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active', 'suspended_after_removal', 'retracted')),
  state_changed_at TEXT,
  state_changed_by_participant_id TEXT REFERENCES participants_new(id) ON DELETE SET NULL,
  tombstone_title TEXT,
  state_transition_id TEXT,
  PRIMARY KEY(project_id, document_id)
);
INSERT INTO project_documents_new SELECT * FROM project_documents;

CREATE TABLE project_invitations_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects_new(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  invited_by_participant_id TEXT NOT NULL REFERENCES participants_new(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('outstanding', 'accepted', 'declined', 'revoked')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_by_participant_id TEXT REFERENCES participants_new(id) ON DELETE SET NULL,
  consumed_at TEXT
);
INSERT INTO project_invitations_new SELECT * FROM project_invitations;

CREATE TABLE project_events_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects_new(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN ('ownership_transferred','project_archived','project_unarchived','member_left','member_removed','contribution_added','contribution_retracted','contribution_suspended','contribution_reauthorized')),
  actor_participant_id TEXT NOT NULL REFERENCES participants_new(id) ON DELETE RESTRICT,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO project_events_new SELECT * FROM project_events;

CREATE TABLE account_events_new (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants_new(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(event_type IN ('account_deletion_scheduled','account_deletion_cancelled','account_deletion_finalized')),
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO account_events_new SELECT * FROM account_events;

DROP TRIGGER documents_tombstone_project_contributions;
DROP TABLE account_events;
DROP TABLE project_events;
DROP TABLE project_invitations;
DROP TABLE project_documents;
DROP TABLE project_members;
DROP TABLE projects;
DROP TABLE participants;

ALTER TABLE participants_new RENAME TO participants;
ALTER TABLE projects_new RENAME TO projects;
ALTER TABLE project_members_new RENAME TO project_members;
ALTER TABLE project_documents_new RENAME TO project_documents;
ALTER TABLE project_invitations_new RENAME TO project_invitations;
ALTER TABLE project_events_new RENAME TO project_events;
ALTER TABLE account_events_new RENAME TO account_events;

CREATE UNIQUE INDEX participants_provenance_identifier ON participants(provenance_identifier);
CREATE INDEX project_members_participant ON project_members(participant_id);
CREATE UNIQUE INDEX project_one_owner ON project_members(project_id) WHERE role = 'owner';
CREATE INDEX project_documents_document ON project_documents(document_id);
CREATE INDEX project_invitations_project ON project_invitations(project_id, status, expires_at);
CREATE INDEX project_events_project ON project_events(project_id, created_at DESC);
CREATE INDEX account_events_participant ON account_events(participant_id, created_at);

CREATE TRIGGER participants_require_provenance_identifier BEFORE INSERT ON participants WHEN NEW.provenance_identifier IS NULL OR NEW.provenance_identifier='' BEGIN SELECT RAISE(ABORT, 'participant provenance identifier is required'); END;
CREATE TRIGGER participants_provenance_identifier_immutable BEFORE UPDATE OF provenance_identifier ON participants WHEN NEW.provenance_identifier IS NOT OLD.provenance_identifier BEGIN SELECT RAISE(ABORT, 'participant provenance identifier is immutable'); END;
CREATE TRIGGER documents_tombstone_project_contributions BEFORE DELETE ON documents BEGIN UPDATE project_documents SET tombstone_title=CASE WHEN state='active' THEN OLD.title ELSE tombstone_title END, state='retracted', state_changed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE document_id=OLD.id AND source_owner_participant_id=OLD.owner_id AND state!='retracted'; END;
CREATE TRIGGER project_documents_active_source_insert BEFORE INSERT ON project_documents WHEN NEW.state='active' AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.id=NEW.document_id AND d.owner_type='participant' AND d.owner_id=NEW.source_owner_participant_id AND d.deleted_at IS NULL) BEGIN SELECT RAISE(ABORT, 'active contribution requires a live owned source'); END;
CREATE TRIGGER project_documents_active_source_update BEFORE UPDATE OF state,document_id,source_owner_participant_id ON project_documents WHEN NEW.state='active' AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.id=NEW.document_id AND d.owner_type='participant' AND d.owner_id=NEW.source_owner_participant_id AND d.deleted_at IS NULL) BEGIN SELECT RAISE(ABORT, 'active contribution requires a live owned source'); END;

PRAGMA foreign_key_check;
