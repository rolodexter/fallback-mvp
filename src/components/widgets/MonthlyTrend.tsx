import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type MonthlyTrendData = {
  title: string;
  months: string[];
  current_year: {
    label: string;
    values: number[];
  };
  previous_year: {
    label: string;
    values: number[];
  };
  percentChange: number;
  summary: {
    current: number;
    previous: number;
  };
};

const MonthlyTrend: React.FC = () => {
  const [data, setData] = useState<MonthlyTrendData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/data/monthly_trend_gross_v1.json');
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
        const jsonData = await response.json();
        setData(jsonData);
      } catch (err) {
        setError('Error loading monthly trend data');
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

  // Transform the data for the chart
  const transformData = () => {
    if (!data) return [];

    return data.months.map((month, index) => ({
      name: month,
      [data.current_year.label]: data.current_year.values[index],
      [data.previous_year.label]: data.previous_year.values[index],
    }));
  };

  if (loading) return <div className="widget">Loading monthly trend data...</div>;
  if (error) return <div className="widget">Error: {error}</div>;
  if (!data) return <div className="widget">No data available</div>;

  const chartData = transformData();

  return (
    <div className="widget">
      <div className="widget-header">
        <h3 className="widget-title">{data.title}</h3>
        <div className="widget-summary">
          <span className={`data-change ${data.percentChange >= 0 ? 'positive' : 'negative'}`}>
            {data.percentChange >= 0 ? '+' : ''}{data.percentChange.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="widget-content">
        <div className="chart-summary">
          <div>
            <div className="summary-label">Current ({data.current_year.label})</div>
            <div className="summary-value">{formatCurrency(data.summary.current)}</div>
          </div>
          <div>
            <div className="summary-label">Previous ({data.previous_year.label})</div>
            <div className="summary-value">{formatCurrency(data.summary.previous)}</div>
          </div>
        </div>
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => `${value / 1000}K`} />
              <Tooltip formatter={(value) => formatCurrency(value as number)} />
              <Legend />
              <Bar dataKey={data.current_year.label} fill="#16a34a" />
              <Bar dataKey={data.previous_year.label} fill="#64748b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default MonthlyTrend;
