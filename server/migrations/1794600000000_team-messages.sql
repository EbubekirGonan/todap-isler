-- Up Migration

-- Ekip sohbeti: yalnızca ekip sayfasında görünür, akışa (activity_log) yazılmaz.
CREATE TABLE team_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id bigint NOT NULL REFERENCES teams (id),
  user_id bigint NOT NULL REFERENCES users (id),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX team_messages_team_created_idx ON team_messages (team_id, created_at DESC, id DESC);

-- Down Migration

DROP TABLE team_messages;
