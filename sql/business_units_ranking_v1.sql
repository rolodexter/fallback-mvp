-- SQL template for ranking business units by importance
-- Parameters:
--   @metric: The metric to use for ranking (revenue, gross, costs)
--   @year: Year to analyze
--   @limit: Number of top units to return
--   @metric_expr: The metric column expression to use (CGBWH_REVENUE, CGBWH_GROSS, CGBWH_COSTS)
--   @fact_table: Facts table to query
--   @dim_table: Dimension table for business unit metadata

WITH yearly_metric AS (
  SELECT
    f.CGBWH_CODEMP AS bu_code,
    SUM(@metric_expr) AS metric_value,
    -- Also get previous year for growth calculation
    LAG(SUM(@metric_expr)) OVER (PARTITION BY f.CGBWH_CODEMP ORDER BY EXTRACT(YEAR FROM f.CGBWH_FECHAMOV)) AS prev_year_value
  FROM `@fact_table` f
  WHERE EXTRACT(YEAR FROM f.CGBWH_FECHAMOV) IN (@year, @year - 1)
  GROUP BY bu_code, EXTRACT(YEAR FROM f.CGBWH_FECHAMOV)
  HAVING EXTRACT(YEAR FROM f.CGBWH_FECHAMOV) = @year
),
total_metric AS (
  SELECT SUM(metric_value) AS total_value FROM yearly_metric
),
ranked_units AS (
  SELECT
    ym.bu_code,
    d.comp_label AS bu_name,
    ym.metric_value,
    SAFE_DIVIDE(ym.metric_value, t.total_value) AS share_of_total,
    SAFE_DIVIDE(ym.metric_value - ym.prev_year_value, ym.prev_year_value) AS yoy_growth,
    -- Calculate an importance score based on multiple factors:
    -- 1. Absolute size (50%)
    -- 2. Share of total (30%)
    -- 3. Growth rate (20%)
    (
      RANK() OVER (ORDER BY ym.metric_value DESC) * 0.5 +
      RANK() OVER (ORDER BY SAFE_DIVIDE(ym.metric_value, t.total_value) DESC) * 0.3 +
      RANK() OVER (ORDER BY SAFE_DIVIDE(ym.metric_value - ym.prev_year_value, ym.prev_year_value) DESC) * 0.2
    ) AS importance_score
  FROM yearly_metric ym
  CROSS JOIN total_metric t
  LEFT JOIN `@dim_table` d ON d.comp_code = ym.bu_code
  WHERE ym.metric_value > 0
)

SELECT
  ru.bu_code,
  ru.bu_name,
  ru.metric_value,
  ROUND(ru.share_of_total * 100, 1) AS percentage_of_total,
  ROUND(ru.yoy_growth * 100, 1) AS yoy_growth_pct,
  CASE
    WHEN ru.importance_score = (SELECT MIN(importance_score) FROM ranked_units) THEN 'Most Important'
    WHEN ru.importance_score <= (SELECT MIN(importance_score) + 2 FROM ranked_units) THEN 'Very Important'
    WHEN ru.importance_score <= (SELECT MIN(importance_score) + 4 FROM ranked_units) THEN 'Important'
    ELSE 'Standard'
  END AS importance_level,
  -- Explain why this business unit is important
  CASE
    WHEN ru.share_of_total > 0.4 THEN 'Dominates the business with over 40% of total'
    WHEN ru.share_of_total > 0.25 THEN 'Major contributor with over 25% of total'
    WHEN ru.share_of_total > 0.15 THEN 'Significant contributor with over 15% of total'
    WHEN ru.yoy_growth > 0.2 THEN 'Fast growing unit with over 20% YoY growth'
    ELSE 'Consistent performer'
  END AS importance_reason
FROM ranked_units ru
ORDER BY ru.importance_score ASC
LIMIT @limit;
