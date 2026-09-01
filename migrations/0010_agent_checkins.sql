ALTER TABLE project_machine_credentials ADD COLUMN checkin_enabled INTEGER NOT NULL DEFAULT 0 CHECK(checkin_enabled IN (0,1));

CREATE TABLE project_machine_checkins (
  id TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL REFERENCES project_machine_credentials(id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  value TEXT NOT NULL CHECK(length(value) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL
);
CREATE INDEX project_machine_checkins_project ON project_machine_checkins(project_id,created_at DESC);
CREATE INDEX project_machine_checkins_credential ON project_machine_checkins(credential_id,created_at DESC);
