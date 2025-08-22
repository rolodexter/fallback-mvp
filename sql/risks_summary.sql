-- SQL query to fetch risk summaries for business units
-- Parameters:
-- @business_unit: Optional business unit filter, if not provided returns all units
-- @year: The year to analyze, defaults to current year

SELECT
  business_unit,
  risk_category,
  risk_impact_score,
  risk_description,
  mitigation_status
FROM
  `Base_IDP_RiskSummary`
WHERE
  (@business_unit IS NULL OR business_unit = @business_unit)
  AND report_year = @year
ORDER BY
  risk_impact_score DESC;
