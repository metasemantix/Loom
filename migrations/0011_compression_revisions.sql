-- Immutable, source-bound Agent compression history. The old documents.compression
-- column remains a compatibility projection and is written only with selection.
ALTER TABLE documents ADD COLUMN selected_compression_revision_id TEXT;
CREATE TABLE compression_revisions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  text TEXT NOT NULL CHECK(length(text) <= 2000),
  source_version_id TEXT REFERENCES document_versions(id) ON DELETE CASCADE,
  actor_type TEXT CHECK(actor_type IN ('human','agent','system')),
  actor_id TEXT,
  created_at TEXT,
  prompt_version TEXT,
  migrated_at TEXT,
  UNIQUE(document_id, revision_number)
);
CREATE INDEX compression_revisions_document ON compression_revisions(document_id,revision_number DESC);
INSERT INTO compression_revisions(id,document_id,revision_number,text,source_version_id,actor_type,actor_id,created_at,prompt_version,migrated_at)
SELECT 'cmp_legacy_' || id,id,1,compression,NULL,NULL,NULL,NULL,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM documents WHERE compression IS NOT NULL;
UPDATE documents SET selected_compression_revision_id='cmp_legacy_' || id WHERE compression IS NOT NULL;
