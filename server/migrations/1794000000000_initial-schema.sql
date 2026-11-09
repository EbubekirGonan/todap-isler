-- Up Migration

CREATE TABLE users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  active boolean NOT NULL DEFAULT true,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

CREATE TABLE teams (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  description text,
  type text NOT NULL CHECK (type IN ('term', 'ongoing')),
  term_start date,
  term_end date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_ongoing_no_term_end_check CHECK (type <> 'ongoing' OR term_end IS NULL)
);

CREATE TABLE team_members (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id bigint NOT NULL REFERENCES teams (id) ON DELETE RESTRICT,
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  role_title text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE UNIQUE INDEX team_members_active_member_key ON team_members (team_id, user_id) WHERE ended_at IS NULL;
CREATE INDEX team_members_active_user_idx ON team_members (user_id) WHERE ended_at IS NULL;

CREATE TABLE projects (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'archived')),
  start_date date,
  due_date date,
  team_id bigint REFERENCES teams (id) ON DELETE RESTRICT,
  created_by bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id bigint REFERENCES projects (id) ON DELETE RESTRICT,
  team_id bigint REFERENCES teams (id) ON DELETE RESTRICT,
  parent_task_id bigint REFERENCES tasks (id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  due_date date,
  completed_at timestamptz,
  needs_assignee boolean NOT NULL DEFAULT false,
  team_only boolean NOT NULL DEFAULT false,
  created_by bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT tasks_team_only_check CHECK (NOT team_only OR team_id IS NOT NULL)
);

CREATE INDEX tasks_status_due_date_idx ON tasks (status, due_date);
CREATE INDEX tasks_project_id_idx ON tasks (project_id);
CREATE INDEX tasks_team_id_idx ON tasks (team_id);

CREATE TABLE task_assignments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id bigint NOT NULL REFERENCES tasks (id) ON DELETE RESTRICT,
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner', 'support', 'approver')),
  source text NOT NULL CHECK (source IN ('assigned', 'claimed')),
  assigned_by bigint REFERENCES users (id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CONSTRAINT task_assignments_assigned_by_check CHECK ((source = 'assigned') = (assigned_by IS NOT NULL))
);

CREATE UNIQUE INDEX task_assignments_one_active_owner_key ON task_assignments (task_id) WHERE role = 'owner' AND ended_at IS NULL;
CREATE UNIQUE INDEX task_assignments_active_task_user_key ON task_assignments (task_id, user_id) WHERE ended_at IS NULL;
CREATE INDEX task_assignments_active_user_idx ON task_assignments (user_id) WHERE ended_at IS NULL;

CREATE TABLE task_comments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id bigint NOT NULL REFERENCES tasks (id) ON DELETE RESTRICT,
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX task_comments_task_id_idx ON task_comments (task_id);

CREATE TABLE task_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id bigint NOT NULL REFERENCES tasks (id) ON DELETE RESTRICT,
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  field text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX task_history_task_id_idx ON task_history (task_id);

-- Down Migration

DROP TABLE task_history;
DROP TABLE task_comments;
DROP TABLE task_assignments;
DROP TABLE tasks;
DROP TABLE projects;
DROP TABLE team_members;
DROP TABLE teams;
DROP TABLE users;
