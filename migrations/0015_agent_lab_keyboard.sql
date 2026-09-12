-- Isolated persistence for the verbatim-link compositional keyboard experiment.
CREATE TABLE agent_lab_keyboard_chains (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE agent_lab_keyboard_messages (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL UNIQUE REFERENCES agent_lab_keyboard_chains(id) ON DELETE CASCADE,
  value TEXT NOT NULL DEFAULT '',
  symbol_count INTEGER NOT NULL DEFAULT 0 CHECK(symbol_count BETWEEN 0 AND 128),
  completed_at TEXT,
  created_at TEXT NOT NULL,
  CHECK(length(value) = symbol_count)
);

CREATE TABLE agent_lab_keyboard_capabilities (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL REFERENCES agent_lab_keyboard_chains(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES agent_lab_keyboard_messages(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expected_operation TEXT NOT NULL CHECK(expected_operation IN ('choose','read')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  consumption_id TEXT UNIQUE,
  CHECK((consumed_at IS NULL) = (consumption_id IS NULL))
);
CREATE INDEX agent_lab_keyboard_capabilities_chain ON agent_lab_keyboard_capabilities(chain_id,created_at);

CREATE TABLE agent_lab_keyboard_events (
  id TEXT PRIMARY KEY,
  chain_id TEXT REFERENCES agent_lab_keyboard_chains(id) ON DELETE CASCADE,
  message_id TEXT,
  capability_id TEXT REFERENCES agent_lab_keyboard_capabilities(id) ON DELETE SET NULL,
  operation TEXT NOT NULL CHECK(operation IN ('enter','choose','complete','read')),
  outcome TEXT NOT NULL CHECK(outcome IN ('created','allowed','malformed','unknown','expired','replayed','wrong_operation','wrong_chain','invalid_choice','length_limit','wrong_state')),
  symbol_count INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX agent_lab_keyboard_events_chain ON agent_lab_keyboard_events(chain_id,created_at);
CREATE INDEX agent_lab_keyboard_events_operation_outcome ON agent_lab_keyboard_events(operation,outcome,created_at);
