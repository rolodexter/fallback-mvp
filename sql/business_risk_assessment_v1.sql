-- SQL for executive risk assessment view
-- Provides a multi-metric view of business units with performance indicators
-- Identifies potential areas of weakness based on growth and absolute performance
-- Parameters:
--   @year: Year to assess (defaults to previous complete year)
--   @dim_table: The dimension table for business unit metadata
--   @fact_table: The facts table to query from
--   @limit: Maximum number of rows to return

DECLARE current_year INT64 DEFAULT @year;
DECLARE previous_year INT64 DEFAULT (@year - 1);

WITH 
-- Current year metrics
current_metrics AS (
  SELECT
    f.CGBWH_CODEMP AS bu_code,
    SUM(f.CGBWH_REVENUE) AS revenue,
    SUM(f.CGBWH_COSTS) AS costs,
    SUM(f.CGBWH_GROSS) AS gross
  FROM `@fact_table` f
  WHERE EXTRACT(YEAR FROM f.CGBWH_FECHAMOV) = current_year
  GROUP BY bu_code
),

-- Previous year metrics for comparison
previous_metrics AS (
  SELECT
    f.CGBWH_CODEMP AS bu_code,
    SUM(f.CGBWH_REVENUE) AS revenue,
    SUM(f.CGBWH_COSTS) AS costs,
    SUM(f.CGBWH_GROSS) AS gross
  FROM `@fact_table` f
  WHERE EXTRACT(YEAR FROM f.CGBWH_FECHAMOV) = previous_year
  GROUP BY bu_code
),

-- Calculate performance indicators
performance AS (
  SELECT
    cm.bu_code,
    d.comp_label AS bu_name,
    -- Current metrics
    cm.revenue,
    cm.costs,
    cm.gross,
    -- Profitability ratio
    SAFE_DIVIDE(cm.gross, cm.revenue) AS margin,
    -- Year over year growth rates
    SAFE_DIVIDE(cm.revenue - pm.revenue, pm.revenue) AS revenue_growth,
    SAFE_DIVIDE(cm.costs - pm.costs, pm.costs) AS cost_growth,
    SAFE_DIVIDE(cm.gross - pm.gross, pm.gross) AS gross_growth,
    -- Previous year metrics
    pm.revenue AS prev_revenue,
    pm.costs AS prev_costs,
    pm.gross AS prev_gross,
    -- Risk score: higher = more risk
    -- Formula weights poor growth and low margins more heavily
    (
      CASE 
        WHEN SAFE_DIVIDE(cm.gross, cm.revenue) < 0.15 THEN 3 
        WHEN SAFE_DIVIDE(cm.gross, cm.revenue) < 0.25 THEN 2
        WHEN SAFE_DIVIDE(cm.gross, cm.revenue) < 0.35 THEN 1
        ELSE 0
      END +
      CASE
        WHEN SAFE_DIVIDE(cm.revenue - pm.revenue, pm.revenue) < -0.1 THEN 4
        WHEN SAFE_DIVIDE(cm.revenue - pm.revenue, pm.revenue) < 0 THEN 2
        WHEN SAFE_DIVIDE(cm.revenue - pm.revenue, pm.revenue) < 0.05 THEN 1
        ELSE 0
      END +
      CASE
        WHEN SAFE_DIVIDE(cm.gross - pm.gross, pm.gross) < -0.15 THEN 4
        WHEN SAFE_DIVIDE(cm.gross - pm.gross, pm.gross) < 0 THEN 2
        WHEN SAFE_DIVIDE(cm.gross - pm.gross, pm.gross) < 0.05 THEN 1
        ELSE 0
      END
    ) AS risk_score
  FROM current_metrics cm
  LEFT JOIN previous_metrics pm ON cm.bu_code = pm.bu_code
  LEFT JOIN `@dim_table` d ON d.comp_code = cm.bu_code
  WHERE pm.revenue IS NOT NULL AND cm.revenue > 0
)

-- Return risk assessment with meaningful categorization
SELECT
  bu_code,
  bu_name,
  revenue,
  ROUND(revenue_growth * 100, 1) AS revenue_growth_pct,
  gross,
  ROUND(gross_growth * 100, 1) AS gross_growth_pct,
  ROUND(margin * 100, 1) AS margin_pct,
  risk_score,
  CASE
    WHEN risk_score >= 8 THEN 'Critical Attention Required'
    WHEN risk_score >= 5 THEN 'High Risk'
    WHEN risk_score >= 3 THEN 'Moderate Risk'
    ELSE 'Stable'
  END AS risk_category,
  CASE
    WHEN revenue_growth < 0 THEN 'Declining Revenue'
    WHEN gross_growth < 0 THEN 'Declining Profitability'
    WHEN margin < 0.2 THEN 'Low Margin'
    WHEN cost_growth > revenue_growth THEN 'Rising Costs'
    WHEN revenue_growth < 0.05 THEN 'Slow Growth'
    ELSE 'Performance Within Range'
  END AS primary_concern
FROM performance
ORDER BY risk_score DESC
LIMIT @limit;
