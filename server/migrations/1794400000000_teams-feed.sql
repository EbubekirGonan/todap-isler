-- Up Migration

-- Takımda gerekli kişi sayısı. Gerekli - aktif üye > 0 ise takıma katılım açık.
ALTER TABLE teams ADD COLUMN required_people integer NOT NULL DEFAULT 0 CHECK (required_people >= 0);

-- Bir faaliyet birden fazla takıma bağlanabilir, bir takım birden fazla faaliyete.
-- Bağlantı kaldırılınca ended_at dolar; aynı takım sonradan yeniden bağlanabilir.
CREATE TABLE project_teams (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
  team_id bigint NOT NULL REFERENCES teams (id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE UNIQUE INDEX project_teams_active_key ON project_teams (project_id, team_id) WHERE ended_at IS NULL;
CREATE INDEX project_teams_team_id_idx ON project_teams (team_id) WHERE ended_at IS NULL;

INSERT INTO project_teams (project_id, team_id)
SELECT id, team_id FROM projects WHERE team_id IS NOT NULL;

ALTER TABLE projects DROP COLUMN team_id;

-- Akış: görev dışındaki hareketlerin kaydı (ekip katılımı, faaliyet ekleme/değiştirme vb.).
-- Görev hareketleri mevcut task_history tablosundan okunur; bu tabloda tekrar tutulmaz.
-- entity_name, kayıt anındaki adın görüntüsüdür; sonradan yeniden adlandırılsa bile geçmiş kayıt bozulmaz.
CREATE TABLE activity_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  action text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('project', 'team')),
  entity_id bigint NOT NULL,
  entity_name text NOT NULL,
  field text,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activity_log_created_at_idx ON activity_log (created_at DESC, id DESC);

-- Down Migration

DROP TABLE activity_log;

ALTER TABLE projects ADD COLUMN team_id bigint REFERENCES teams (id) ON DELETE RESTRICT;

UPDATE projects p
   SET team_id = (
     SELECT MIN(pt.team_id) FROM project_teams pt WHERE pt.project_id = p.id AND pt.ended_at IS NULL
   );

DROP TABLE project_teams;

ALTER TABLE teams DROP COLUMN required_people;
