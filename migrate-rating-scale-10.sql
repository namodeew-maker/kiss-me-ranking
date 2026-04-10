BEGIN;

ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_looks_score_check;
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_service_score_check;
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_value_score_check;

ALTER TABLE ratings
    ADD CONSTRAINT ratings_looks_score_check CHECK (looks_score BETWEEN 1 AND 10);

ALTER TABLE ratings
    ADD CONSTRAINT ratings_service_score_check CHECK (service_score BETWEEN 1 AND 10);

ALTER TABLE ratings
    ADD CONSTRAINT ratings_value_score_check CHECK (value_score BETWEEN 1 AND 10);

COMMIT;