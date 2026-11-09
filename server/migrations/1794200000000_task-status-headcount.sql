-- Up Migration

-- Durumlar dört aşamaya indirilir: planning, in_progress, nearly_done, done.
ALTER TABLE tasks DROP CONSTRAINT tasks_status_check;
UPDATE tasks SET status = 'planning' WHERE status = 'todo';
UPDATE tasks SET status = 'in_progress' WHERE status = 'doing';
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'planning';
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('planning', 'in_progress', 'nearly_done', 'done'));

UPDATE task_history SET old_value = 'planning' WHERE field = 'status' AND old_value = 'todo';
UPDATE task_history SET old_value = 'in_progress' WHERE field = 'status' AND old_value = 'doing';
UPDATE task_history SET new_value = 'planning' WHERE field = 'status' AND new_value = 'todo';
UPDATE task_history SET new_value = 'in_progress' WHERE field = 'status' AND new_value = 'doing';

-- "Kişi lazım" kaldırılır; yerine tahmini gerekli kişi sayısı gelir. Varsayılan 1'dir.
ALTER TABLE tasks DROP COLUMN needs_assignee;
ALTER TABLE tasks ADD COLUMN estimated_people integer NOT NULL DEFAULT 1;
ALTER TABLE tasks ADD CONSTRAINT tasks_estimated_people_check CHECK (estimated_people BETWEEN 1 AND 50);

-- Bir göreve birden çok katkı sağlayan kişi olabilir; sayı sınırı uygulama katmanında denetlenir.
DROP INDEX task_assignments_one_active_owner_key;

-- Down Migration
DROP INDEX IF EXISTS task_assignments_one_active_owner_key;
CREATE UNIQUE INDEX task_assignments_one_active_owner_key ON task_assignments (task_id) WHERE role = 'owner' AND ended_at IS NULL;

ALTER TABLE tasks DROP CONSTRAINT tasks_estimated_people_check;
ALTER TABLE tasks DROP COLUMN estimated_people;
ALTER TABLE tasks ADD COLUMN needs_assignee boolean NOT NULL DEFAULT false;

UPDATE task_history SET old_value = 'todo' WHERE field = 'status' AND old_value IN ('planning', 'nearly_done');
UPDATE task_history SET old_value = 'doing' WHERE field = 'status' AND old_value = 'in_progress';
UPDATE task_history SET new_value = 'todo' WHERE field = 'status' AND new_value IN ('planning', 'nearly_done');
UPDATE task_history SET new_value = 'doing' WHERE field = 'status' AND new_value = 'in_progress';

ALTER TABLE tasks DROP CONSTRAINT tasks_status_check;
UPDATE tasks SET status = 'todo' WHERE status IN ('planning', 'nearly_done');
UPDATE tasks SET status = 'doing' WHERE status = 'in_progress';
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'todo';
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('todo', 'doing', 'done'));
