ALTER TABLE "DocumentChunk" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;

CREATE INDEX "DocumentChunk_searchVector_idx" ON "DocumentChunk" USING GIN ("searchVector");
