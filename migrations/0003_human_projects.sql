PRAGMA foreign_keys = ON;

ALTER TABLE projects ADD COLUMN description TEXT NOT NULL DEFAULT '';

CREATE TABLE project_members_new (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY(project_id, participant_id)
);
INSERT INTO project_members_new SELECT project_id, participant_id, role, joined_at FROM project_members;
DROP TABLE project_members;
ALTER TABLE project_members_new RENAME TO project_members;
CREATE INDEX project_members_participant ON project_members(participant_id);
CREATE UNIQUE INDEX project_one_owner ON project_members(project_id) WHERE role = 'owner';

CREATE TABLE project_invitations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  invited_by_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('outstanding', 'accepted', 'declined', 'revoked')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_by_participant_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
  consumed_at TEXT
);
CREATE INDEX project_invitations_project ON project_invitations(project_id, status, expires_at);

CREATE TABLE project_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN ('ownership_transferred')),
  actor_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX project_events_project ON project_events(project_id, created_at DESC);
