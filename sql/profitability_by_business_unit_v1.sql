-- Profitability by Business Unit
-- Params: { year?: number } (default: latest complete year)
WITH fiscal_years AS (
  SELECT 
    COALESCE(CAST(@year AS INT64), 
      (SELECT MAX(EXTRACT(YEAR FROM transaction_date)) 
       FROM `finance.transactions` 
       WHERE EXTRACT(MONTH FROM transaction_date) = 12)
    ) AS selected_year
),
revenue_data AS (
  SELECT 
    business_unit,
    SUM(amount_ars) AS revenue_ars
  FROM `finance.transactions`
  WHERE 
    transaction_type = 'REVENUE' 
    AND EXTRACT(YEAR FROM transaction_date) = (SELECT selected_year FROM fiscal_years)
  GROUP BY business_unit
),
cogs_data AS (
  SELECT 
    business_unit,
    SUM(amount_ars) AS cogs_ars
  FROM `finance.transactions`
  WHERE 
    transaction_type = 'COGS' 
    AND EXTRACT(YEAR FROM transaction_date) = (SELECT selected_year FROM fiscal_years)
  GROUP BY business_unit
)

SELECT 
  r.business_unit,
  r.revenue_ars,
  COALESCE(c.cogs_ars, 0) AS cogs_ars,
  (r.revenue_ars - COALESCE(c.cogs_ars, 0)) AS gross_margin_ars,
  SAFE_DIVIDE((r.revenue_ars - COALESCE(c.cogs_ars, 0)), r.revenue_ars) * 100 AS gross_margin_pct
FROM revenue_data r
LEFT JOIN cogs_data c
  ON r.business_unit = c.business_unit
ORDER BY gross_margin_ars DESC
