PRAGMA foreign_keys = ON;

ALTER TABLE projects ADD COLUMN lifecycle_state TEXT NOT NULL DEFAULT 'active'
  CHECK(lifecycle_state IN ('active', 'archived'));
ALTER TABLE projects ADD COLUMN archived_at TEXT;
ALTER TABLE projects ADD COLUMN archived_by_participant_id TEXT REFERENCES participants(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN lifecycle_transition_id TEXT;

CREATE TABLE project_documents_new (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  source_owner_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  added_by_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  added_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active', 'suspended_after_removal', 'retracted')),
  state_changed_at TEXT,
  state_changed_by_participant_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
  tombstone_title TEXT,
  state_transition_id TEXT,
  PRIMARY KEY(project_id, document_id)
);
INSERT INTO project_documents_new(project_id,document_id,source_owner_participant_id,added_by_participant_id,added_at,tombstone_title)
SELECT pd.project_id,pd.document_id,d.owner_id,pd.added_by_participant_id,pd.added_at,d.title
FROM project_documents pd JOIN documents d ON d.id=pd.document_id;
DROP TABLE project_documents;
ALTER TABLE project_documents_new RENAME TO project_documents;
CREATE INDEX project_documents_document ON project_documents(document_id);

CREATE TABLE project_events_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'ownership_transferred','project_archived','project_unarchived','member_left',
    'member_removed','contribution_retracted','contribution_suspended','contribution_reauthorized'
  )),
  actor_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO project_events_new SELECT * FROM project_events;
DROP TABLE project_events;
ALTER TABLE project_events_new RENAME TO project_events;
CREATE INDEX project_events_project ON project_events(project_id, created_at DESC);
