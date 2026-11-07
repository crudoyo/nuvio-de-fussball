ALTER TABLE access_slots ADD COLUMN setup_hash TEXT;
ALTER TABLE access_slots ADD COLUMN setup_expires_at INTEGER;

CREATE UNIQUE INDEX access_slots_setup_hash ON access_slots(setup_hash)
  WHERE setup_hash IS NOT NULL;
