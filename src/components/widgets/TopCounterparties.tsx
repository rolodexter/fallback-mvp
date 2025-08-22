import React, { useEffect, useState } from 'react';
import { Sparklines, SparklinesLine } from 'react-sparklines';
import { executeBigQuery } from '../../services/bigQueryClient';

// Type definition for BigQuery counterparty data
type BigQueryCounterparty = {
  counterparty_name: string;
  revenue_amount: number;
  revenue_percent: number;
  yoy_change_pct: number;
};

// Type for the processed counterparty data
type Counterparty = {
  name: string;
  current: number;
  previous: number;
  percentChange: number;
  trend: number[];
};

type CounterpartiesData = {
  title: string;
  counterparties: Counterparty[];
};

const TopCounterparties: React.FC = () => {
  const [data, setData] = useState<CounterpartiesData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // First try to get data from BigQuery
        const response = await executeBigQuery('customers_top_n', { limit: 5 });
        
        if (response.success && response.rows?.length) {
          // Transform BigQuery data to the expected format
          const counterparties = response.rows as BigQueryCounterparty[];
          
          // Process into the format expected by the component
          const processedCounterparties = counterparties.map(cp => {
            // Calculate previous year revenue based on current and YoY change
            const current = cp.revenue_amount;
            const percentChange = cp.yoy_change_pct;
            const previous = current / (1 + (percentChange / 100));
            
            // Generate simple trend data (could be enhanced with actual time series data)
            const trendStart = previous * 0.9;
            const trendEnd = current;
            const trendStep = (trendEnd - trendStart) / 4;
            const trend = [
              trendStart,
              trendStart + trendStep,
              trendStart + trendStep * 2,
              trendStart + trendStep * 3,
              trendEnd,
            ];
            
            return {
              name: cp.counterparty_name,
              current,
              previous,
              percentChange,
              trend
            };
          });
          
          setData({
            title: "Top Counterparties",
            counterparties: processedCounterparties
          });
        } else {
          // Fallback to static data
          const fallbackResponse = await fetch(window.location.origin + '/data/top_counterparties_gross_v1.json');
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
          console.log('Using fallback data for Top Counterparties - BigQuery failed:', response.diagnostics?.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading counterparties data');
        console.error('Top Counterparties widget error:', err);
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

  if (loading) return <div className="widget">Loading counterparties data...</div>;
  if (error) return <div className="widget">Error: {error}</div>;
  if (!data) return <div className="widget">No data available</div>;

  return (
    <div className="widget">
      <div className="widget-header">
        <h3 className="widget-title">{data.title}</h3>
      </div>
      <div className="widget-content">
        {data.counterparties.map((cp) => (
          <div key={cp.name} className="data-row">
            <div className="data-name">{cp.name}</div>
            <div className="data-values">
              <div className="data-current">{formatCurrency(cp.current)}</div>
              <div className="data-previous">{formatCurrency(cp.previous)}</div>
              <div className={`data-change ${cp.percentChange >= 0 ? 'positive' : 'negative'}`}>
                {cp.percentChange >= 0 ? '+' : ''}{cp.percentChange.toFixed(1)}%
              </div>
              <div className="data-chart">
                <Sparklines data={cp.trend} width={80} height={30}>
                  <SparklinesLine color={cp.percentChange >= 0 ? '#16a34a' : '#dc2626'} />
                </Sparklines>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TopCounterparties;
