CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE FUNCTION kh_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE TEXT SEARCH CONFIGURATION kh_spanish (COPY = pg_catalog.spanish);
ALTER TEXT SEARCH CONFIGURATION kh_spanish ALTER MAPPING FOR hword, hword_part, word WITH unaccent, spanish_stem;
CREATE TEXT SEARCH CONFIGURATION kh_english (COPY = pg_catalog.english);
ALTER TEXT SEARCH CONFIGURATION kh_english ALTER MAPPING FOR hword, hword_part, word WITH unaccent, english_stem;
CREATE TEXT SEARCH CONFIGURATION kh_simple (COPY = pg_catalog.simple);
ALTER TEXT SEARCH CONFIGURATION kh_simple ALTER MAPPING FOR hword, hword_part, word WITH unaccent, simple;

ALTER TABLE "Document" ADD COLUMN "language" text NOT NULL DEFAULT 'unknown' CHECK ("language" IN ('es', 'en', 'unknown'));
ALTER TABLE "DocumentChunk" ADD COLUMN "language" text NOT NULL DEFAULT 'unknown' CHECK ("language" IN ('es', 'en', 'unknown'));
DROP INDEX "DocumentChunk_searchVector_idx";
ALTER TABLE "DocumentChunk" DROP COLUMN "searchVector";
ALTER TABLE "DocumentChunk" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  to_tsvector('public.kh_simple'::regconfig, public.kh_unaccent(content)) ||
  CASE WHEN language IN ('es', 'unknown') THEN to_tsvector('public.kh_spanish'::regconfig, public.kh_unaccent(content)) ELSE ''::tsvector END ||
  CASE WHEN language IN ('en', 'unknown') THEN to_tsvector('public.kh_english'::regconfig, public.kh_unaccent(content)) ELSE ''::tsvector END
) STORED;
CREATE INDEX "DocumentChunk_searchVector_idx" ON "DocumentChunk" USING GIN ("searchVector");
