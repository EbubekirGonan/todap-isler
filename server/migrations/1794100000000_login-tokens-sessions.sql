-- Up Migration

-- Token ve kodların yalnızca hash'i saklanır. Süre dolan ya da kullanılan kayıtlar silinmez.
CREATE TABLE login_tokens (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  token_hash text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT login_tokens_attempts_check CHECK (attempts >= 0)
);

CREATE UNIQUE INDEX login_tokens_token_hash_key ON login_tokens (token_hash);
CREATE INDEX login_tokens_user_created_idx ON login_tokens (user_id, created_at);

-- Oturum süresi kaydırmalıdır: son kullanım (last_seen_at) boşta kalma süresini belirler.
CREATE TABLE sessions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE UNIQUE INDEX sessions_token_hash_key ON sessions (token_hash);
CREATE INDEX sessions_user_active_idx ON sessions (user_id) WHERE revoked_at IS NULL;

-- Down Migration

DROP TABLE sessions;
DROP TABLE login_tokens;
