-- Explicit public reply/thread relations, independent of capability and author chains.
CREATE TABLE agent_lab_keyboard_thread_chains (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE agent_lab_keyboard_thread_members (
  thread_chain_id TEXT NOT NULL REFERENCES agent_lab_keyboard_thread_chains(id) ON DELETE CASCADE,
  message_chain_id TEXT NOT NULL UNIQUE REFERENCES agent_lab_keyboard_chains(id) ON DELETE CASCADE,
  thread_index INTEGER NOT NULL CHECK(thread_index >= 1),
  parent_message_chain_id TEXT REFERENCES agent_lab_keyboard_chains(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(thread_chain_id,thread_index),
  CHECK((thread_index=1 AND parent_message_chain_id IS NULL) OR
        (thread_index>1 AND parent_message_chain_id IS NOT NULL))
);
CREATE INDEX agent_lab_keyboard_thread_members_parent
  ON agent_lab_keyboard_thread_members(thread_chain_id,parent_message_chain_id);

-- Parent-in-the-same-thread is a cross-row invariant, so enforce it at insertion.
CREATE TRIGGER agent_lab_keyboard_thread_parent_insert
BEFORE INSERT ON agent_lab_keyboard_thread_members
WHEN NEW.parent_message_chain_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM agent_lab_keyboard_thread_members
    WHERE thread_chain_id=NEW.thread_chain_id
      AND message_chain_id=NEW.parent_message_chain_id
  ) THEN RAISE(ABORT,'thread parent must belong to thread') END;
END;

PRAGMA foreign_key_check;
