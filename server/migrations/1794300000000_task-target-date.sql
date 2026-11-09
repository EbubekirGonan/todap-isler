-- Up Migration

-- Ara hedef tarihi: teslim tarihinden (due_date) ayrı, işin ara adımı için isteğe bağlı tarih.
ALTER TABLE tasks ADD COLUMN target_date date;

-- Down Migration

ALTER TABLE tasks DROP COLUMN target_date;
