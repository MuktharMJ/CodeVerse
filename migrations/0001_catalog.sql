CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TABLE technologies (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('Web', 'Backend', 'Database', 'AI')),
  name text NOT NULL,
  description text NOT NULL,
  detail text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  symbol text NOT NULL,
  position double precision[] NOT NULL CHECK (
    array_ndims(position) = 1 AND array_lower(position, 1) = 1 AND cardinality(position) = 3
    AND position[1] IS NOT NULL AND position[2] IS NOT NULL AND position[3] IS NOT NULL
    AND '-Infinity'::double precision < ALL(position)
    AND 'Infinity'::double precision > ALL(position)
  ),
  size double precision NOT NULL CHECK (size > 0 AND size < 'Infinity'::double precision),
  "order" integer NOT NULL DEFAULT 0,
  sources jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(sources) = 'object'
    AND sources - ARRAY['github', 'npm', 'githubNote', 'npmNote'] = '{}'::jsonb
    AND (NOT sources ? 'github' OR jsonb_typeof(sources -> 'github') = 'string')
    AND (NOT sources ? 'npm' OR jsonb_typeof(sources -> 'npm') = 'string')
    AND (NOT sources ? 'githubNote' OR jsonb_typeof(sources -> 'githubNote') = 'string')
    AND (NOT sources ? 'npmNote' OR jsonb_typeof(sources -> 'npmNote') = 'string')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER technologies_updated_at BEFORE UPDATE ON technologies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE relationships (
  id text PRIMARY KEY,
  source text NOT NULL REFERENCES technologies(id),
  target text NOT NULL REFERENCES technologies(id),
  kind text NOT NULL CHECK (kind IN ('ecosystem', 'dependency')),
  provenance text NOT NULL CHECK (provenance IN ('curated', 'npm')),
  directed boolean NOT NULL,
  weight double precision CHECK (weight >= 0 AND weight <= 1),
  explanation text,
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source <> target)
);

CREATE UNIQUE INDEX relationships_undirected_unique
ON relationships (least(source, target), greatest(source, target), kind) WHERE NOT directed;
CREATE UNIQUE INDEX relationships_directed_unique
ON relationships (source, target, kind) WHERE directed;
CREATE INDEX relationships_source_idx ON relationships (source);
CREATE INDEX relationships_target_idx ON relationships (target);
CREATE TRIGGER relationships_updated_at BEFORE UPDATE ON relationships
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  technology_id text NOT NULL REFERENCES technologies(id),
  provider text NOT NULL CHECK (provider IN ('github', 'npm')),
  source_key text NOT NULL CHECK (length(source_key) > 0),
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL CHECK (isfinite(fetched_at)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (technology_id, provider, source_key)
);

CREATE INDEX snapshots_fetched_at_idx ON snapshots (fetched_at);
CREATE TRIGGER snapshots_updated_at BEFORE UPDATE ON snapshots
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
