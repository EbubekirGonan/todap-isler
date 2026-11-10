-- Up Migration

-- Dernek sekmesindeki kutucuklar. Yalnızca yönetici ekler ve düzenler; ekiple ilişkisi yoktur.
-- Sıralama eklenme sırasına göre yapılır (id). Silme fiziksel değil, deleted_at ile yapılır.
CREATE TABLE association_tiles (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  description text CHECK (description IS NULL OR length(description) <= 2000),
  created_by bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Kutucukta görünen kişiler. Kişi çıkarılınca ended_at dolar; aynı kişi sonradan yeniden eklenebilir.
CREATE TABLE association_tile_members (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tile_id bigint NOT NULL REFERENCES association_tiles (id) ON DELETE RESTRICT,
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE UNIQUE INDEX association_tile_members_active_key ON association_tile_members (tile_id, user_id) WHERE ended_at IS NULL;

-- Down Migration

DROP TABLE association_tile_members;

DROP TABLE association_tiles;
