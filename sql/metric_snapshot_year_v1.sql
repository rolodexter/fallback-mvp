-- SQL template: metric_snapshot_year_v1
-- Domain: metrics
-- Params:
--   @metric STRING  -- one of: 'revenue', 'costs', 'gross' (aliases normalized upstream)
--   @year   INT64   -- target year (defaults applied upstream if missing)
--   @unit   STRING  -- optional BU code (e.g., 'Z001')
-- Expected output schema:
--   value FLOAT64       -- current year aggregate value for the metric
--   prev_value FLOAT64  -- previous year aggregate value for YoY comparison
--   currency STRING     -- optional currency code/symbol

-- Placeholder implementation:
-- This query intentionally returns 0 rows. The template runtime will detect the
-- absence of rows and fall back to deterministic mock data. Replace this with a
-- real SELECT against your warehouse tables once available.

WITH args AS (
  SELECT
    @metric AS metric,
    @year   AS year,
    @unit   AS unit
)
SELECT
  CAST(NULL AS FLOAT64) AS value,
  CAST(NULL AS FLOAT64) AS prev_value,
  '€' AS currency
WHERE FALSE;
