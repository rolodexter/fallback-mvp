-- Regional Revenue Trend 24 Months
-- Params: { region?: string } (optional filter; if null returns all regions)
WITH date_range AS (
  SELECT 
    MAX(transaction_date) AS max_date
  FROM `finance.transactions`
  WHERE transaction_type = 'REVENUE'
),
months AS (
  SELECT 
    FORMAT_DATE('%Y%m', DATE_SUB(
      (SELECT max_date FROM date_range), 
      INTERVAL n MONTH
    )) AS yyyymm,
    DATE_SUB(
      (SELECT max_date FROM date_range), 
      INTERVAL n MONTH
    ) AS period_date
  FROM UNNEST(GENERATE_ARRAY(0, 23)) AS n
),
region_revenues AS (
  SELECT 
    FORMAT_DATE('%Y%m', transaction_date) AS yyyymm,
    region,
    SUM(amount_ars) AS revenue_ars
  FROM `finance.transactions`
  WHERE 
    transaction_type = 'REVENUE'
    AND transaction_date >= DATE_SUB(
      (SELECT max_date FROM date_range),
      INTERVAL 24 MONTH
    )
    AND (@region IS NULL OR region = @region)
  GROUP BY yyyymm, region
)

SELECT 
  m.yyyymm,
  COALESCE(r.region, 
    CASE 
      WHEN @region IS NOT NULL THEN @region
      ELSE 'Unknown'
    END
  ) AS region,
  COALESCE(r.revenue_ars, 0) AS revenue_ars
FROM months m
LEFT JOIN region_revenues r
  ON m.yyyymm = r.yyyymm
ORDER BY m.yyyymm DESC, region
