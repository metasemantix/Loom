-- Rebuild the table because SQLite cannot alter the existing text CHECK.
-- Every column is copied verbatim; no provenance or artifact conversion occurs.
CREATE TABLE compression_revisions_new (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  text TEXT NOT NULL CHECK(length(text) <= 8000),
  source_version_id TEXT REFERENCES document_versions(id) ON DELETE CASCADE,
  actor_type TEXT CHECK(actor_type IN ('human','agent','system')),
  actor_id TEXT,
  created_at TEXT,
  prompt_version TEXT,
  migrated_at TEXT,
  artifact_format TEXT NOT NULL DEFAULT 'legacy-prose' CHECK(artifact_format IN ('legacy-prose','structured-v3')),
  schema_version INTEGER,
  artifact_json TEXT CHECK(artifact_json IS NULL OR json_valid(artifact_json)),
  UNIQUE(document_id, revision_number)
);
INSERT INTO compression_revisions_new (
  id,document_id,revision_number,text,source_version_id,actor_type,actor_id,
  created_at,prompt_version,migrated_at,artifact_format,schema_version,artifact_json
)
SELECT id,document_id,revision_number,text,source_version_id,actor_type,actor_id,
  created_at,prompt_version,migrated_at,artifact_format,schema_version,artifact_json
FROM compression_revisions;
DROP TABLE compression_revisions;
ALTER TABLE compression_revisions_new RENAME TO compression_revisions;
CREATE INDEX compression_revisions_document ON compression_revisions(document_id,revision_number DESC);
