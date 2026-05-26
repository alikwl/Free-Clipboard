-- SQL Migration Script for FreeClipboard ClipMind RAG & Knowledge Graph
-- Copy and paste this script into your Supabase SQL Editor (https://supabase.com)

-- 1. Enable pgvector Extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create Embeddings Table
CREATE TABLE IF NOT EXISTS public.clip_embeddings (
    clip_id UUID PRIMARY KEY REFERENCES public.clips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    embedding vector(1536) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for high-performance HNSW cosine search
CREATE INDEX IF NOT EXISTS idx_clip_embeddings_hnsw 
ON public.clip_embeddings USING hnsw (embedding vector_cosine_ops);

-- 3. Create Embedding Background Queue Table
CREATE TABLE IF NOT EXISTS public.clip_embedding_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    clip_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    error_message TEXT,
    attempts INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clip_embedding_queue_status 
ON public.clip_embedding_queue(status, created_at);

-- 4. Create Knowledge Graph Nodes Table
CREATE TABLE IF NOT EXISTS public.knowledge_nodes (
    id VARCHAR(255) PRIMARY KEY, -- format: 'clip_UUID', 'folder_UUID', 'tag_TAGNAME', 'entity_TYPE_NAME'
    user_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'clip', 'tag', 'folder', 'task', 'entity', 'link'
    properties JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_user ON public.knowledge_nodes(user_id);

-- 5. Create Knowledge Graph Edges Table
CREATE TABLE IF NOT EXISTS public.knowledge_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    source_node_id VARCHAR(255) REFERENCES public.knowledge_nodes(id) ON DELETE CASCADE,
    target_node_id VARCHAR(255) REFERENCES public.knowledge_nodes(id) ON DELETE CASCADE,
    relation_type VARCHAR(50) NOT NULL, -- 'related_to', 'mentions', 'belongs_to', 'generated_from', 'similar_to'
    properties JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_user_edge UNIQUE (user_id, source_node_id, target_node_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_edges_user ON public.knowledge_edges(user_id);

-- 6. RPC Function for Cosine Vector Matching
CREATE OR REPLACE FUNCTION match_clips (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  clip_id uuid,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.clip_id,
    1 - (ce.embedding <=> query_embedding) AS similarity
  FROM public.clip_embeddings ce
  WHERE ce.user_id = p_user_id
    AND 1 - (ce.embedding <=> query_embedding) > match_threshold
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 7. Trigger to automatically queue new/updated clips
CREATE OR REPLACE FUNCTION queue_clip_for_embedding()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.clip_embedding_queue (user_id, clip_id, status)
    VALUES (NEW.user_id, NEW.id, 'pending')
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_queue_clip_embedding ON public.clips;
CREATE TRIGGER trg_queue_clip_embedding
AFTER INSERT OR UPDATE OF content ON public.clips
FOR EACH ROW
EXECUTE FUNCTION queue_clip_for_embedding();
