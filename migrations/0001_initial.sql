PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(provider, provider_user_id)
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);
CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  public_slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  withdrawn_at TEXT
);
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK(owner_type IN ('participant', 'experiment', 'system')),
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('profile', 'introduction', 'document')),
  title TEXT NOT NULL,
  logical_path TEXT NOT NULL,
  current_version_id TEXT,
  visibility TEXT NOT NULL CHECK(visibility IN ('private', 'public')),
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(owner_type, owner_id, logical_path)
);
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
CREATE INDEX documents_owner ON documents(owner_type, owner_id, deleted_at);
CREATE INDEX versions_document ON document_versions(document_id, version_number DESC);
