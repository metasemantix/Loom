PRAGMA defer_foreign_keys = ON;

CREATE TABLE project_members_backup AS SELECT * FROM project_members;
CREATE TABLE project_documents_backup AS SELECT * FROM project_documents;
CREATE TABLE project_invitations_backup AS SELECT * FROM project_invitations;
CREATE TABLE project_events_backup AS SELECT * FROM project_events;
DROP TRIGGER documents_tombstone_project_contributions;
DROP TABLE project_events;
DROP TABLE project_invitations;
DROP TABLE project_documents;
DROP TABLE project_members;

CREATE TABLE projects_new (
  id TEXT PRIMARY KEY,name TEXT NOT NULL,created_by_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  read_audience TEXT NOT NULL CHECK(read_audience IN ('members_and_agents','agents_only')),created_at TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',
  lifecycle_state TEXT NOT NULL DEFAULT 'active' CHECK(lifecycle_state IN ('active','archived','shell')),archived_at TEXT,
  archived_by_participant_id TEXT REFERENCES participants(id) ON DELETE SET NULL,lifecycle_transition_id TEXT,
  deletion_scheduled_at TEXT,deletion_due_at TEXT,deletion_scheduled_by_participant_id TEXT REFERENCES participants(id) ON DELETE SET NULL,deletion_finalized_at TEXT
);
INSERT INTO projects_new(id,name,created_by_participant_id,read_audience,created_at,description,lifecycle_state,archived_at,archived_by_participant_id,lifecycle_transition_id)
SELECT id,name,created_by_participant_id,read_audience,created_at,description,lifecycle_state,archived_at,archived_by_participant_id,lifecycle_transition_id FROM projects;
DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;

CREATE TABLE project_members(project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN ('owner','admin','member')),joined_at TEXT NOT NULL,PRIMARY KEY(project_id,participant_id));
INSERT INTO project_members SELECT * FROM project_members_backup; DROP TABLE project_members_backup;
CREATE INDEX project_members_participant ON project_members(participant_id); CREATE UNIQUE INDEX project_one_owner ON project_members(project_id) WHERE role='owner';
CREATE TABLE project_documents(project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,document_id TEXT NOT NULL,source_owner_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,added_by_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,added_at TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','suspended_after_removal','retracted')),state_changed_at TEXT,state_changed_by_participant_id TEXT REFERENCES participants(id) ON DELETE SET NULL,tombstone_title TEXT,state_transition_id TEXT,PRIMARY KEY(project_id,document_id));
INSERT INTO project_documents SELECT * FROM project_documents_backup; DROP TABLE project_documents_backup; CREATE INDEX project_documents_document ON project_documents(document_id);
CREATE TABLE project_invitations(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,token_hash TEXT NOT NULL UNIQUE,invited_by_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,status TEXT NOT NULL CHECK(status IN ('outstanding','accepted','declined','revoked')),created_at TEXT NOT NULL,expires_at TEXT NOT NULL,consumed_by_participant_id TEXT REFERENCES participants(id) ON DELETE SET NULL,consumed_at TEXT);
INSERT INTO project_invitations SELECT * FROM project_invitations_backup; DROP TABLE project_invitations_backup; CREATE INDEX project_invitations_project ON project_invitations(project_id,status,expires_at);
CREATE TABLE project_events(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,event_type TEXT NOT NULL CHECK(event_type IN ('ownership_transferred','project_archived','project_unarchived','member_left','member_removed','contribution_added','contribution_retracted','contribution_suspended','contribution_reauthorized','native_document_created','native_document_edited','native_document_deleted','native_document_copied','project_deletion_scheduled','project_deletion_cancelled','project_deletion_finalized')),actor_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,details_json TEXT NOT NULL,created_at TEXT NOT NULL);
INSERT INTO project_events SELECT * FROM project_events_backup; DROP TABLE project_events_backup; CREATE INDEX project_events_project ON project_events(project_id,created_at DESC);

-- Deliberately excludes content, snapshots, patches, and diffs. This is the
-- inspectable revision-provenance portion of the terminal shell.
CREATE TABLE project_document_revision_shell(
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id,revision_id)
);
CREATE INDEX project_document_revision_shell_document ON project_document_revision_shell(project_id,document_id,version_number);

CREATE TRIGGER project_documents_active_source_insert BEFORE INSERT ON project_documents WHEN NEW.state='active' AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.id=NEW.document_id AND d.owner_type='participant' AND d.owner_id=NEW.source_owner_participant_id AND d.deleted_at IS NULL) BEGIN SELECT RAISE(ABORT,'active contribution requires a live owned source'); END;
CREATE TRIGGER project_documents_active_source_update BEFORE UPDATE OF state,document_id,source_owner_participant_id ON project_documents WHEN NEW.state='active' AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.id=NEW.document_id AND d.owner_type='participant' AND d.owner_id=NEW.source_owner_participant_id AND d.deleted_at IS NULL) BEGIN SELECT RAISE(ABORT,'active contribution requires a live owned source'); END;
CREATE TRIGGER documents_tombstone_project_contributions BEFORE DELETE ON documents BEGIN UPDATE project_documents SET tombstone_title=CASE WHEN state='active' THEN OLD.title ELSE tombstone_title END,state='retracted',state_changed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE document_id=OLD.id AND source_owner_participant_id=OLD.owner_id AND state!='retracted'; END;

PRAGMA foreign_key_check;
