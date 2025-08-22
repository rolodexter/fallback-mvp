import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { executeBigQuery } from '../../services/bigQueryClient';

// Type definition for BigQuery monthly trend data
type BigQueryMonthlyData = {
  month: string;
  month_num: number;
  revenue_current_year: number;
  revenue_previous_year: number;
};

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
        // First try to get data from BigQuery
        const response = await executeBigQuery('monthly_trends_v1');
        
        if (response.success && response.rows?.length) {
          // Transform BigQuery data to the expected format
          const monthlyData = response.rows as BigQueryMonthlyData[];
          
          // Sort by month number
          const sortedData = [...monthlyData].sort((a, b) => a.month_num - b.month_num);
          
          // Extract month names, current year values, and previous year values
          const months = sortedData.map(item => item.month);
          const currentYearValues = sortedData.map(item => item.revenue_current_year);
          const previousYearValues = sortedData.map(item => item.revenue_previous_year);
          
          // Calculate totals and percent change
          const currentTotal = currentYearValues.reduce((sum, value) => sum + value, 0);
          const previousTotal = previousYearValues.reduce((sum, value) => sum + value, 0);
          const percentChange = ((currentTotal - previousTotal) / previousTotal) * 100;
          
          // Get the current year and previous year (can be retrieved from the first data point)
          const currentYear = new Date().getFullYear().toString();
          const previousYear = (new Date().getFullYear() - 1).toString();
          
          // Create the formatted data object
          const formattedData: MonthlyTrendData = {
            title: "Monthly Revenue Trends",
            months: months,
            current_year: {
              label: currentYear,
              values: currentYearValues
            },
            previous_year: {
              label: previousYear,
              values: previousYearValues
            },
            percentChange: percentChange,
            summary: {
              current: currentTotal,
              previous: previousTotal
            }
          };
          
          setData(formattedData);
        } else {
          // Fallback to static data
          const fallbackResponse = await fetch(window.location.origin + '/data/monthly_trend_gross_v1.json');
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
          console.log('Using fallback data for Monthly Trends - BigQuery failed:', response.diagnostics?.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading monthly trend data');
        console.error('Monthly Trend widget error:', err);
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
