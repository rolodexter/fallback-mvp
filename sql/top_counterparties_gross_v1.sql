-- Top Counterparties by Gross (YTD)
-- Parameters:
-- @year: The year to analyze (defaults server-side to latest complete year)
-- @limit: Number of counterparties to return (default 5)

SELECT
  counterparty_name,
  revenue_amount AS gross_amount,
  revenue_percent,
  yoy_change_pct
FROM `Base_IDP_TopCounterparties`
WHERE report_year = @year
ORDER BY gross_amount DESC
LIMIT @limit;
