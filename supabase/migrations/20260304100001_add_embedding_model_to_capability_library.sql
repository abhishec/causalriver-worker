-- ADR-027 Bug 5: Add embedding model version tracking to capability_library
-- Without this, old embeddings from deprecated models are silently used for
-- vector search, causing inaccurate semantic matches after model upgrades.

ALTER TABLE public.capability_library
  ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(64) DEFAULT 'text-embedding-3-small',
  ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.capability_library.embedding_model IS
  'Embedding model used to generate the embedding vector. Used to detect stale embeddings after model upgrades.';
COMMENT ON COLUMN public.capability_library.embedding_updated_at IS
  'Timestamp when embedding was last regenerated. NULL means never embedded.';
