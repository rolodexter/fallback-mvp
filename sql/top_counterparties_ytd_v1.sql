-- Top Counterparties by Gross (YTD)
-- Parameters:
-- @year: The year to analyze (defaults server-side to latest complete year)
-- @top: Number of counterparties to return (default 5)

SELECT
  counterparty_name,
  revenue_amount AS gross_amount,
  revenue_percent,
  yoy_change_pct
FROM `${dataset}.counterparty_facts`
WHERE report_year = @year
  AND date_part <= current_date()
ORDER BY gross_amount DESC
LIMIT @top;
