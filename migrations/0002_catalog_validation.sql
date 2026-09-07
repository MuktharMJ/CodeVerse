ALTER TABLE technologies ADD CONSTRAINT technologies_aliases_flat CHECK (
  cardinality(aliases) = 0 OR (array_ndims(aliases) = 1 AND array_position(aliases, NULL) IS NULL)
);
ALTER TABLE technologies ADD CONSTRAINT technologies_safe_identity CHECK (
  id ~ '^[a-z0-9][a-z0-9-]*$' AND slug ~ '^[a-z0-9][a-z0-9-]*$'
  AND id NOT IN ('constructor', 'prototype') AND slug NOT IN ('constructor', 'prototype')
);
CREATE INDEX technologies_category_idx ON technologies (category);
CREATE INDEX technologies_order_idx ON technologies ("order", id);
