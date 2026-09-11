-- Isolated persistence for the experimental anonymous GET capability chain.
CREATE TABLE agent_lab_chains (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE agent_lab_capabilities (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL REFERENCES agent_lab_chains(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expected_operation TEXT NOT NULL CHECK(expected_operation IN ('write','read','complete')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  consumption_id TEXT UNIQUE,
  CHECK((consumed_at IS NULL) = (consumption_id IS NULL))
);
CREATE INDEX agent_lab_capabilities_chain ON agent_lab_capabilities(chain_id,created_at);

CREATE TABLE agent_lab_entries (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL REFERENCES agent_lab_chains(id) ON DELETE CASCADE,
  entry_index INTEGER NOT NULL CHECK(entry_index > 0),
  value TEXT NOT NULL,
  byte_count INTEGER NOT NULL CHECK(byte_count BETWEEN 1 AND 1024),
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(chain_id,entry_index)
);
CREATE INDEX agent_lab_entries_chain ON agent_lab_entries(chain_id,entry_index);

CREATE TABLE agent_lab_events (
  id TEXT PRIMARY KEY,
  chain_id TEXT REFERENCES agent_lab_chains(id) ON DELETE CASCADE,
  capability_id TEXT REFERENCES agent_lab_capabilities(id) ON DELETE SET NULL,
  operation TEXT NOT NULL CHECK(operation IN ('enter','write','read')),
  outcome TEXT NOT NULL CHECK(outcome IN ('created','allowed','malformed','unknown','expired','replayed','wrong_operation','wrong_chain')),
  entry_id TEXT,
  byte_count INTEGER,
  content_hash TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX agent_lab_events_chain ON agent_lab_events(chain_id,created_at);
CREATE INDEX agent_lab_events_operation_outcome ON agent_lab_events(operation,outcome,created_at);
