CREATE TABLE friends (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slot_limit INTEGER NOT NULL CHECK (slot_limit BETWEEN 1 AND 4),
  blocked INTEGER NOT NULL DEFAULT 0 CHECK (blocked IN (0, 1)),
  created_at INTEGER NOT NULL
);

CREATE TABLE access_slots (
  id TEXT PRIMARY KEY NOT NULL,
  friend_id TEXT NOT NULL REFERENCES friends(id),
  invite_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  device_hash TEXT UNIQUE,
  device_name TEXT,
  created_at INTEGER NOT NULL,
  activated_at INTEGER,
  revoked_at INTEGER,
  CHECK ((device_hash IS NULL AND activated_at IS NULL) OR
         (device_hash IS NOT NULL AND activated_at IS NOT NULL))
);
CREATE INDEX slots_by_friend ON access_slots(friend_id, revoked_at, expires_at);

CREATE TABLE access_audit (
  id INTEGER PRIMARY KEY,
  friend_id TEXT NOT NULL REFERENCES friends(id),
  event TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TRIGGER audit_new_friend AFTER INSERT ON friends BEGIN
  INSERT INTO access_audit(friend_id,event,at) VALUES(NEW.id,'friend_created',NEW.created_at);
END;
CREATE TRIGGER audit_friend_update AFTER UPDATE OF blocked,slot_limit ON friends
WHEN OLD.blocked <> NEW.blocked OR OLD.slot_limit <> NEW.slot_limit BEGIN
  INSERT INTO access_audit(friend_id,event,at) VALUES(NEW.id,
    CASE WHEN OLD.blocked = NEW.blocked THEN 'limit_changed'
      WHEN NEW.blocked = 1 THEN 'friend_blocked' ELSE 'friend_unblocked' END,unixepoch()*1000);
END;
CREATE TRIGGER audit_invite AFTER INSERT ON access_slots BEGIN
  INSERT INTO access_audit(friend_id,event,at) VALUES(NEW.friend_id,'invite_created',NEW.created_at);
END;
CREATE TRIGGER audit_activate AFTER UPDATE OF activated_at ON access_slots
WHEN NEW.activated_at IS NOT NULL AND OLD.activated_at IS NULL BEGIN
  INSERT INTO access_audit(friend_id,event,at) VALUES(NEW.friend_id,'device_activated',NEW.activated_at);
END;
CREATE TRIGGER audit_revoke AFTER UPDATE OF revoked_at ON access_slots
WHEN NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL BEGIN
  INSERT INTO access_audit(friend_id,event,at) VALUES(NEW.friend_id,
    CASE WHEN NEW.activated_at IS NULL THEN 'invite_cancelled' ELSE 'device_revoked' END,NEW.revoked_at);
END;
