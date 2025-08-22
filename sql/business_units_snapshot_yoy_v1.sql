-- SQL query to fetch business units performance with year-over-year comparison
-- Parameters: 
-- @year: The year to compare against previous year, defaults to latest complete year

SELECT
  business_unit,
  revenue_this_year,
  revenue_last_year,
  yoy_growth_pct
FROM
  `Base_IDP_BusinessUnitsSnapshot`
WHERE
  report_year = @year
ORDER BY
  revenue_this_year DESC;
