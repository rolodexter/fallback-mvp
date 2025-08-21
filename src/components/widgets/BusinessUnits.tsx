import React, { useEffect, useState } from 'react';
import { Sparklines, SparklinesLine } from 'react-sparklines';

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
        // Make sure we get the full URL from the root
        const response = await fetch(window.location.origin + '/data/business_units_snapshot_yoy_v1.json');
        if (!response.ok) {
          throw new Error(`Failed to fetch data: ${response.status}`);
        }
        // Check the content before parsing
        const text = await response.text();
        if (!text || text.trim() === '') {
          throw new Error('Empty response received');
        }
        const jsonData = JSON.parse(text);
        setData(jsonData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading business units data');
        console.error(err);
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
