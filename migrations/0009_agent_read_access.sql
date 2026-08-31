ALTER TABLE documents ADD COLUMN compression TEXT;

CREATE TABLE project_machine_credentials (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  authorized_by_participant_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by_participant_id TEXT REFERENCES participants(id) ON DELETE SET NULL
);
CREATE INDEX project_machine_credentials_project ON project_machine_credentials(project_id,created_at DESC);

CREATE TABLE machine_read_audit (
  id TEXT PRIMARY KEY,
  credential_id TEXT REFERENCES project_machine_credentials(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  operation TEXT NOT NULL,
  target_document_id TEXT,
  occurred_at TEXT NOT NULL,
  allowed INTEGER NOT NULL CHECK(allowed IN (0,1)),
  result_code TEXT NOT NULL
);
CREATE INDEX machine_read_audit_credential ON machine_read_audit(credential_id,occurred_at DESC);
CREATE INDEX machine_read_audit_project ON machine_read_audit(project_id,occurred_at DESC);
