-- Split the deployed multi-message keyboard chains into one chain per message and
-- add explicit author continuity and durable, revocable re-entry capabilities.
PRAGMA defer_foreign_keys = ON;

ALTER TABLE agent_lab_keyboard_events RENAME TO agent_lab_keyboard_events_0016;
ALTER TABLE agent_lab_keyboard_capabilities RENAME TO agent_lab_keyboard_capabilities_0016;
ALTER TABLE agent_lab_keyboard_messages RENAME TO agent_lab_keyboard_messages_0016;
ALTER TABLE agent_lab_keyboard_chains RENAME TO agent_lab_keyboard_chains_0016;
DROP INDEX agent_lab_keyboard_events_chain;
DROP INDEX agent_lab_keyboard_events_operation_outcome;
DROP INDEX agent_lab_keyboard_capabilities_chain;
DROP INDEX agent_lab_keyboard_capabilities_predecessor;

CREATE TABLE agent_lab_keyboard_chains (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

-- The reserved legacy prefix cannot collide with IDs produced by opaque("akc").
INSERT INTO agent_lab_keyboard_chains(id,created_at)
SELECT CASE WHEN m.message_index=1 THEN m.chain_id ELSE 'akc_legacy_message_'||hex(m.id) END,m.created_at
FROM agent_lab_keyboard_messages_0016 m;

CREATE TABLE agent_lab_keyboard_messages (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL UNIQUE REFERENCES agent_lab_keyboard_chains(id) ON DELETE CASCADE,
  value TEXT NOT NULL DEFAULT '',
  symbol_count INTEGER NOT NULL DEFAULT 0 CHECK(symbol_count BETWEEN 0 AND 128),
  completed_at TEXT,
  created_at TEXT NOT NULL,
  CHECK(length(value) = symbol_count)
);
INSERT INTO agent_lab_keyboard_messages(id,chain_id,value,symbol_count,completed_at,created_at)
SELECT id,CASE WHEN message_index=1 THEN chain_id ELSE 'akc_legacy_message_'||hex(id) END,value,symbol_count,completed_at,created_at
FROM agent_lab_keyboard_messages_0016;

CREATE TABLE agent_lab_keyboard_author_chains (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE TABLE agent_lab_keyboard_author_members (
  author_chain_id TEXT NOT NULL REFERENCES agent_lab_keyboard_author_chains(id) ON DELETE CASCADE,
  message_chain_id TEXT NOT NULL UNIQUE REFERENCES agent_lab_keyboard_chains(id) ON DELETE CASCADE,
  author_index INTEGER NOT NULL CHECK(author_index >= 1),
  created_at TEXT NOT NULL,
  PRIMARY KEY(author_chain_id,author_index)
);
INSERT INTO agent_lab_keyboard_author_chains(id,created_at)
SELECT 'aka_legacy_'||hex(chain_id),MIN(created_at) FROM agent_lab_keyboard_messages_0016
GROUP BY chain_id HAVING COUNT(*)>1;
INSERT INTO agent_lab_keyboard_author_members(author_chain_id,message_chain_id,author_index,created_at)
SELECT 'aka_legacy_'||hex(m.chain_id),CASE WHEN m.message_index=1 THEN m.chain_id ELSE 'akc_legacy_message_'||hex(m.id) END,m.message_index,m.created_at
FROM agent_lab_keyboard_messages_0016 m
WHERE (SELECT COUNT(*) FROM agent_lab_keyboard_messages_0016 x WHERE x.chain_id=m.chain_id)>1;

CREATE TABLE agent_lab_keyboard_capabilities (
  id TEXT PRIMARY KEY,
  chain_id TEXT REFERENCES agent_lab_keyboard_chains(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES agent_lab_keyboard_messages(id) ON DELETE CASCADE,
  author_chain_id TEXT REFERENCES agent_lab_keyboard_author_chains(id) ON DELETE CASCADE,
  predecessor_capability_id TEXT REFERENCES agent_lab_keyboard_capabilities(id),
  token_hash TEXT NOT NULL UNIQUE,
  expected_operation TEXT NOT NULL CHECK(expected_operation IN ('choose','read','continue','reenter')),
  created_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  consumed_at TEXT,
  consumption_id TEXT UNIQUE,
  CHECK((consumed_at IS NULL) = (consumption_id IS NULL)),
  CHECK((expected_operation='reenter' AND author_chain_id IS NOT NULL AND expires_at IS NULL) OR
        (expected_operation<>'reenter' AND chain_id IS NOT NULL AND message_id IS NOT NULL AND author_chain_id IS NULL AND expires_at IS NOT NULL))
);
CREATE INDEX agent_lab_keyboard_capabilities_chain ON agent_lab_keyboard_capabilities(chain_id,created_at);
CREATE INDEX agent_lab_keyboard_capabilities_author ON agent_lab_keyboard_capabilities(author_chain_id,created_at);
CREATE UNIQUE INDEX agent_lab_keyboard_capabilities_predecessor ON agent_lab_keyboard_capabilities(predecessor_capability_id) WHERE predecessor_capability_id IS NOT NULL;
INSERT INTO agent_lab_keyboard_capabilities(id,chain_id,message_id,author_chain_id,predecessor_capability_id,token_hash,expected_operation,created_at,expires_at,revoked_at,consumed_at,consumption_id)
SELECT c.id,m.chain_id,c.message_id,NULL,c.predecessor_capability_id,c.token_hash,c.expected_operation,c.created_at,c.expires_at,NULL,c.consumed_at,c.consumption_id
FROM agent_lab_keyboard_capabilities_0016 c JOIN agent_lab_keyboard_messages m ON m.id=c.message_id;

CREATE TABLE agent_lab_keyboard_events (
  id TEXT PRIMARY KEY,
  chain_id TEXT REFERENCES agent_lab_keyboard_chains(id) ON DELETE CASCADE,
  message_id TEXT,
  author_chain_id TEXT REFERENCES agent_lab_keyboard_author_chains(id) ON DELETE SET NULL,
  capability_id TEXT REFERENCES agent_lab_keyboard_capabilities(id) ON DELETE SET NULL,
  operation TEXT NOT NULL CHECK(operation IN ('enter','choose','complete','read','continue','preserve','reenter')),
  outcome TEXT NOT NULL CHECK(outcome IN ('created','allowed','malformed','unknown','expired','revoked','replayed','wrong_operation','wrong_chain','invalid_choice','length_limit','wrong_state')),
  symbol_count INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX agent_lab_keyboard_events_chain ON agent_lab_keyboard_events(chain_id,created_at);
CREATE INDEX agent_lab_keyboard_events_author ON agent_lab_keyboard_events(author_chain_id,created_at);
CREATE INDEX agent_lab_keyboard_events_operation_outcome ON agent_lab_keyboard_events(operation,outcome,created_at);
INSERT INTO agent_lab_keyboard_events(id,chain_id,message_id,author_chain_id,capability_id,operation,outcome,symbol_count,created_at)
SELECT e.id,m.chain_id,e.message_id,am.author_chain_id,e.capability_id,e.operation,e.outcome,e.symbol_count,e.created_at
FROM agent_lab_keyboard_events_0016 e
LEFT JOIN agent_lab_keyboard_messages m ON m.id=e.message_id
LEFT JOIN agent_lab_keyboard_author_members am ON am.message_chain_id=m.chain_id;

DROP TABLE agent_lab_keyboard_events_0016;
DROP TABLE agent_lab_keyboard_capabilities_0016;
DROP TABLE agent_lab_keyboard_messages_0016;
DROP TABLE agent_lab_keyboard_chains_0016;
PRAGMA foreign_key_check;
