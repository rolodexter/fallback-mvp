-- SQL query to fetch top counterparties (customers) by revenue
-- Parameters:
-- @year: The year to analyze, defaults to latest complete year
-- @limit: Number of top customers to return, defaults to 5

SELECT
  counterparty_name,
  revenue_amount,
  revenue_percent,
  yoy_change_pct
FROM
  `Base_IDP_TopCounterparties`
WHERE
  report_year = @year
ORDER BY
  revenue_amount DESC
LIMIT
  @limit;
