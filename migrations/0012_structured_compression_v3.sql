-- Additive v3 structured artifacts. Historical prose rows remain explicitly legacy.
ALTER TABLE compression_revisions ADD COLUMN artifact_format TEXT NOT NULL DEFAULT 'legacy-prose' CHECK(artifact_format IN ('legacy-prose','structured-v3'));
ALTER TABLE compression_revisions ADD COLUMN schema_version INTEGER;
ALTER TABLE compression_revisions ADD COLUMN artifact_json TEXT CHECK(artifact_json IS NULL OR json_valid(artifact_json));
