PRAGMA foreign_keys = ON;

ALTER TABLE documents ADD COLUMN original_filename TEXT;
ALTER TABLE documents ADD COLUMN original_content_type TEXT;

CREATE TABLE document_events (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN ('metadata_changed')),
  actor_type TEXT NOT NULL CHECK(actor_type IN ('human', 'agent', 'system')),
  actor_id TEXT,
  changes_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX document_events_document ON document_events(document_id, created_at DESC);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  read_audience TEXT NOT NULL CHECK(read_audience IN ('members_and_agents', 'agents_only')),
  created_at TEXT NOT NULL
);
CREATE TABLE project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner', 'member')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY(project_id, participant_id)
);
CREATE TABLE project_documents (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  added_by_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL,
  PRIMARY KEY(project_id, document_id)
);
CREATE INDEX project_members_participant ON project_members(participant_id);
CREATE INDEX project_documents_document ON project_documents(document_id);
