-- Split current metric across business units for the requested period
-- Parameters:
--   @metric_expr: The metric column expression (CGBWH_REVENUE, CGBWH_GROSS, CGBWH_COSTS)
--   @fact_table: The facts table to query from
--   @dim_table: The dimension table for business unit metadata
--   @top: Maximum number of rows to return

DECLARE end_month DATE DEFAULT DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH);
DECLARE start_month DATE DEFAULT DATE_SUB(end_month, INTERVAL 11 MONTH);

WITH fact AS (
  SELECT
    f.CGBWH_CODEMP          AS bu_code,
    SUM(@metric_expr)       AS value
  FROM `@fact_table` f
  WHERE DATE_TRUNC(f.CGBWH_FECHAMOV, MONTH) BETWEEN start_month AND end_month
  GROUP BY bu_code
),
denom AS (SELECT SUM(value) AS total FROM fact),
all_count AS (SELECT COUNT(DISTINCT comp_code) AS total_count FROM `@dim_table`)

SELECT
  f.bu_code,
  d.comp_label                            AS bu_name,
  f.value,
  SAFE_DIVIDE(f.value, denom.total)       AS share,
  ac.total_count
FROM fact f
JOIN denom
CROSS JOIN all_count ac
LEFT JOIN `@dim_table` d
  ON d.comp_code = f.bu_code
ORDER BY value DESC
LIMIT @top;
