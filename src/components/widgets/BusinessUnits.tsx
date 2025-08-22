import React, { useEffect, useState } from 'react';
import { Sparklines, SparklinesLine } from 'react-sparklines';
import { executeBigQuery } from '../../services/bigQueryClient';

// Type definition for BigQuery business unit data
type BigQueryBusinessUnit = {
  business_unit: string;
  revenue_this_year: number;
  revenue_last_year: number;
  yoy_growth_pct: number;
};

// Type definition for the processed business unit data
type BusinessUnit = {
  name: string;
  current: number;
  previous: number;
  percentChange: number;
  trend: number[];
};

type BusinessUnitsData = {
  title: string;
  units: BusinessUnit[];
};

const BusinessUnits: React.FC = () => {
  const [data, setData] = useState<BusinessUnitsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // First try to get data from BigQuery
        const response = await executeBigQuery('business_units_snapshot_yoy_v1');
        
        if (response.success && response.rows?.length) {
          // Transform BigQuery data to the expected format
          const businessUnits = response.rows as BigQueryBusinessUnit[];
          
          // Sort by revenue (current year)
          const sortedUnits = [...businessUnits].sort(
            (a, b) => b.revenue_this_year - a.revenue_this_year
          );
          
          // Process into the format expected by the component
          const processedUnits = sortedUnits.map(unit => {
            // Generate simple trend data (could be enhanced with actual time series data)
            const trendStart = unit.revenue_last_year * 0.9;
            const trendEnd = unit.revenue_this_year;
            const trendStep = (trendEnd - trendStart) / 4;
            const trend = [
              trendStart,
              trendStart + trendStep,
              trendStart + trendStep * 2,
              trendStart + trendStep * 3,
              trendEnd,
            ];
            
            return {
              name: unit.business_unit,
              current: unit.revenue_this_year,
              previous: unit.revenue_last_year,
              percentChange: unit.yoy_growth_pct,
              trend
            };
          });
          
          setData({
            title: "Business Unit Performance",
            units: processedUnits
          });
        } else {
          // Fallback to static data
          const fallbackResponse = await fetch(window.location.origin + '/data/business_units_snapshot_yoy_v1.json');
          if (!fallbackResponse.ok) {
            throw new Error(`Failed to fetch fallback data: ${fallbackResponse.status}`);
          }
          const text = await fallbackResponse.text();
          if (!text || text.trim() === '') {
            throw new Error('Empty fallback response received');
          }
          const jsonData = JSON.parse(text);
          setData(jsonData);
          
          // Log that we're using fallback data
          console.log('Using fallback data for Business Units - BigQuery failed:', response.diagnostics?.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading business units data');
        console.error('Business Units widget error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (loading) return <div className="widget">Loading business units data...</div>;
  if (error) return <div className="widget">Error: {error}</div>;
  if (!data) return <div className="widget">No data available</div>;

  return (
    <div className="widget">
      <div className="widget-header">
        <h3 className="widget-title">{data.title}</h3>
      </div>
      <div className="widget-content">
        {data.units.map((unit) => (
          <div key={unit.name} className="data-row">
            <div className="data-name">{unit.name}</div>
            <div className="data-values">
              <div className="data-current">{formatCurrency(unit.current)}</div>
              <div className="data-previous">{formatCurrency(unit.previous)}</div>
              <div className={`data-change ${unit.percentChange >= 0 ? 'positive' : 'negative'}`}>
                {unit.percentChange >= 0 ? '+' : ''}{unit.percentChange.toFixed(1)}%
              </div>
              <div className="data-chart">
                <Sparklines data={unit.trend} width={80} height={30}>
                  <SparklinesLine color={unit.percentChange >= 0 ? '#16a34a' : '#dc2626'} />
                </Sparklines>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BusinessUnits;
