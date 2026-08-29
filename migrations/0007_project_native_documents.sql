PRAGMA defer_foreign_keys = ON;

-- Rebuild the child tables explicitly before replacing their parent. Dropping
-- documents while document_versions still references it with ON DELETE CASCADE
-- would correctly (but destructively) erase every existing revision.
CREATE TABLE document_versions_backup AS SELECT * FROM document_versions;
CREATE TABLE document_events_backup AS SELECT * FROM document_events;
DROP TABLE document_events;
DROP TABLE document_versions;

CREATE TABLE documents_new (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK(owner_type IN ('participant', 'project', 'experiment', 'system')),
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('profile', 'introduction', 'document')),
  title TEXT NOT NULL,
  logical_path TEXT NOT NULL,
  current_version_id TEXT,
  visibility TEXT NOT NULL CHECK(visibility IN ('private', 'public')),
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  original_filename TEXT,
  original_content_type TEXT,
  created_by_participant_id TEXT REFERENCES participants(id) ON DELETE RESTRICT,
  creator_deletion_until TEXT,
  source_document_id TEXT,
  source_owner_participant_id TEXT REFERENCES participants(id) ON DELETE RESTRICT,
  CHECK(owner_type != 'project' OR (created_by_participant_id IS NOT NULL AND creator_deletion_until IS NOT NULL)),
  UNIQUE(owner_type, owner_id, logical_path)
);
INSERT INTO documents_new(id,owner_type,owner_id,kind,title,logical_path,current_version_id,visibility,created_at,deleted_at,original_filename,original_content_type)
SELECT id,owner_type,owner_id,kind,title,logical_path,current_version_id,visibility,created_at,deleted_at,original_filename,original_content_type FROM documents;
DROP TRIGGER documents_tombstone_project_contributions;
DROP TRIGGER project_documents_active_source_insert;
DROP TRIGGER project_documents_active_source_update;
DROP TABLE documents;
ALTER TABLE documents_new RENAME TO documents;
CREATE INDEX documents_owner ON documents(owner_type, owner_id, deleted_at);

CREATE TABLE document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK(content_type IN ('text/markdown', 'application/json', 'text/plain')),
  actor_type TEXT NOT NULL CHECK(actor_type IN ('human', 'agent', 'system')),
  actor_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(document_id, version_number)
);
INSERT INTO document_versions SELECT * FROM document_versions_backup;
DROP TABLE document_versions_backup;
CREATE INDEX versions_document ON document_versions(document_id, version_number DESC);

CREATE TABLE document_events (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN ('metadata_changed')),
  actor_type TEXT NOT NULL CHECK(actor_type IN ('human', 'agent', 'system')),
  actor_id TEXT,
  changes_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO document_events SELECT * FROM document_events_backup;
DROP TABLE document_events_backup;
CREATE INDEX document_events_document ON document_events(document_id, created_at DESC);

CREATE TRIGGER documents_tombstone_project_contributions BEFORE DELETE ON documents BEGIN UPDATE project_documents SET tombstone_title=CASE WHEN state='active' THEN OLD.title ELSE tombstone_title END, state='retracted', state_changed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE document_id=OLD.id AND source_owner_participant_id=OLD.owner_id AND state!='retracted'; END;
CREATE TRIGGER project_documents_active_source_insert BEFORE INSERT ON project_documents WHEN NEW.state='active' AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.id=NEW.document_id AND d.owner_type='participant' AND d.owner_id=NEW.source_owner_participant_id AND d.deleted_at IS NULL) BEGIN SELECT RAISE(ABORT, 'active contribution requires a live owned source'); END;
CREATE TRIGGER project_documents_active_source_update BEFORE UPDATE OF state,document_id,source_owner_participant_id ON project_documents WHEN NEW.state='active' AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.id=NEW.document_id AND d.owner_type='participant' AND d.owner_id=NEW.source_owner_participant_id AND d.deleted_at IS NULL) BEGIN SELECT RAISE(ABORT, 'active contribution requires a live owned source'); END;

CREATE TABLE project_events_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN ('ownership_transferred','project_archived','project_unarchived','member_left','member_removed','contribution_added','contribution_retracted','contribution_suspended','contribution_reauthorized','native_document_created','native_document_edited','native_document_deleted','native_document_copied')),
  actor_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO project_events_new SELECT * FROM project_events;
DROP TABLE project_events;
ALTER TABLE project_events_new RENAME TO project_events;
CREATE INDEX project_events_project ON project_events(project_id, created_at DESC);

PRAGMA foreign_key_check;
