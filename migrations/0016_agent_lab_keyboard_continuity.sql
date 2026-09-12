-- Continue keyboard capability chains across multiple ordered messages.
PRAGMA defer_foreign_keys = ON;

ALTER TABLE agent_lab_keyboard_events RENAME TO agent_lab_keyboard_events_0015;
ALTER TABLE agent_lab_keyboard_capabilities RENAME TO agent_lab_keyboard_capabilities_0015;
ALTER TABLE agent_lab_keyboard_messages RENAME TO agent_lab_keyboard_messages_0015;
DROP INDEX agent_lab_keyboard_events_chain;
DROP INDEX agent_lab_keyboard_events_operation_outcome;
DROP INDEX agent_lab_keyboard_capabilities_chain;

CREATE TABLE agent_lab_keyboard_messages (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL REFERENCES agent_lab_keyboard_chains(id) ON DELETE CASCADE,
  message_index INTEGER NOT NULL CHECK(message_index >= 1),
  value TEXT NOT NULL DEFAULT '',
  symbol_count INTEGER NOT NULL DEFAULT 0 CHECK(symbol_count BETWEEN 0 AND 128),
  completed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(chain_id,message_index),
  CHECK(length(value) = symbol_count)
);

CREATE TABLE agent_lab_keyboard_capabilities (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL REFERENCES agent_lab_keyboard_chains(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES agent_lab_keyboard_messages(id) ON DELETE CASCADE,
  predecessor_capability_id TEXT REFERENCES agent_lab_keyboard_capabilities(id),
  token_hash TEXT NOT NULL UNIQUE,
  expected_operation TEXT NOT NULL CHECK(expected_operation IN ('choose','read','continue')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  consumption_id TEXT UNIQUE,
  CHECK((consumed_at IS NULL) = (consumption_id IS NULL))
);
CREATE INDEX agent_lab_keyboard_capabilities_chain ON agent_lab_keyboard_capabilities(chain_id,created_at);
CREATE UNIQUE INDEX agent_lab_keyboard_capabilities_predecessor ON agent_lab_keyboard_capabilities(predecessor_capability_id) WHERE predecessor_capability_id IS NOT NULL;

CREATE TABLE agent_lab_keyboard_events (
  id TEXT PRIMARY KEY,
  chain_id TEXT REFERENCES agent_lab_keyboard_chains(id) ON DELETE CASCADE,
  message_id TEXT,
  capability_id TEXT REFERENCES agent_lab_keyboard_capabilities(id) ON DELETE SET NULL,
  operation TEXT NOT NULL CHECK(operation IN ('enter','choose','complete','read','continue')),
  outcome TEXT NOT NULL CHECK(outcome IN ('created','allowed','malformed','unknown','expired','replayed','wrong_operation','wrong_chain','invalid_choice','length_limit','wrong_state')),
  symbol_count INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX agent_lab_keyboard_events_chain ON agent_lab_keyboard_events(chain_id,created_at);
CREATE INDEX agent_lab_keyboard_events_operation_outcome ON agent_lab_keyboard_events(operation,outcome,created_at);

INSERT INTO agent_lab_keyboard_messages(id,chain_id,message_index,value,symbol_count,completed_at,created_at)
SELECT id,chain_id,1,value,symbol_count,completed_at,created_at FROM agent_lab_keyboard_messages_0015;
INSERT INTO agent_lab_keyboard_capabilities(id,chain_id,message_id,predecessor_capability_id,token_hash,expected_operation,created_at,expires_at,consumed_at,consumption_id)
SELECT id,chain_id,message_id,NULL,token_hash,expected_operation,created_at,expires_at,consumed_at,consumption_id FROM agent_lab_keyboard_capabilities_0015;
INSERT INTO agent_lab_keyboard_events(id,chain_id,message_id,capability_id,operation,outcome,symbol_count,created_at)
SELECT id,chain_id,message_id,capability_id,operation,outcome,symbol_count,created_at FROM agent_lab_keyboard_events_0015;

DROP TABLE agent_lab_keyboard_events_0015;
DROP TABLE agent_lab_keyboard_capabilities_0015;
DROP TABLE agent_lab_keyboard_messages_0015;
PRAGMA foreign_key_check;
