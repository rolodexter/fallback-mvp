import React, { useEffect, useState } from 'react';
import { Sparklines, SparklinesLine } from 'react-sparklines';

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
        const response = await fetch('/data/top_counterparties_gross_v1.json');
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
        const jsonData = await response.json();
        setData(jsonData);
      } catch (err) {
        setError('Error loading counterparties data');
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
