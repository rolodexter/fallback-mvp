-- Monthly Gross Trend (Last 6 Months)
-- No parameters required; derives the latest complete date from data
-- Output columns: yyyymm (STRING), gross_amount (NUMERIC)
WITH date_range AS (
  SELECT 
    MAX(transaction_date) AS max_date
  FROM `finance.transactions`
  WHERE transaction_type = 'REVENUE'
),
months AS (
  SELECT 
    FORMAT_DATE('%Y%m', DATE_TRUNC(DATE_SUB((SELECT max_date FROM date_range), INTERVAL 1 MONTH), MONTH)) AS anchor_yyyymm,
    GENERATE_ARRAY(0, 5) AS offsets
),
last6 AS (
  SELECT 
    FORMAT_DATE('%Y%m', DATE_SUB(PARSE_DATE('%Y%m', anchor_yyyymm), INTERVAL off MONTH)) AS yyyymm
  FROM months, UNNEST(offsets) AS off
),
agg AS (
  SELECT 
    FORMAT_DATE('%Y%m', transaction_date) AS yyyymm,
    SUM(amount_ars) AS gross_amount
  FROM `finance.transactions`
  WHERE transaction_type = 'REVENUE'
    AND transaction_date >= DATE_SUB((SELECT max_date FROM date_range), INTERVAL 7 MONTH)
  GROUP BY yyyymm
)
SELECT 
  l.yyyymm,
  COALESCE(a.gross_amount, 0) AS gross_amount
FROM last6 l
LEFT JOIN agg a USING (yyyymm)
ORDER BY l.yyyymm ASC;
