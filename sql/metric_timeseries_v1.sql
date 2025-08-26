-- SQL template: metric_timeseries_v1
-- Domain: metrics
-- Params:
--   @metric      STRING  -- one of: 'revenue', 'costs', 'gross' (aliases normalized upstream)
--   @from        STRING  -- inclusive start, formats like 'YYYY' or 'YYYY-MM'
--   @to          STRING  -- inclusive end, formats like 'YYYY' or 'YYYY-MM'
--   @granularity STRING  -- one of: 'month', 'quarter', 'year'
--   @unit        STRING  -- optional BU code (e.g., 'Z001')
-- Expected output schema:
--   period STRING   -- label per point (e.g., '202401', '2024-Q1', or '2024')
--   value  FLOAT64  -- numeric value for the metric at that period

-- Placeholder implementation:
-- This query intentionally returns 0 rows. The template runtime will detect the
-- absence of rows and fall back to deterministic mock data. Replace this with a
-- real SELECT against your warehouse tables once available.

WITH args AS (
  SELECT
    @metric      AS metric,
    @from        AS from_str,
    @to          AS to_str,
    @granularity AS granularity,
    @unit        AS unit
)
SELECT
  CAST(NULL AS STRING)  AS period,
  CAST(NULL AS FLOAT64) AS value
WHERE FALSE;
