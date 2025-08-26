import React from 'react';
import TableWidget, { TableColumn } from './TableWidget';
import './Widget.css';

interface MetricBreakdownProps {
  data: {
    title: string;
    metric: string;
    period: string;
    rows: Array<{
      unit: string;
      label?: string;
      value: number;
      share: number;
    }>;
    showBarChart?: boolean;
  };
}

const MetricBreakdown: React.FC<MetricBreakdownProps> = ({ data }) => {
  const {
    title,
    metric,
    period,
    rows,
    showBarChart = true
  } = data;

  // Format the unit code and label
  const formatUnitLabel = (unit: string, label?: string) => {
    if (label) {
      return `${unit} — ${label}`;
    }
    return unit;
  };

  // Prepare table data
  const tableRows = rows.map(row => ({
    id: row.unit,
    unit: formatUnitLabel(row.unit, row.label),
    value: row.value,
    share: row.share,
    bar: row.share // For bar chart visualization
  }));

  // Use the imported TableColumn interface

  // Define columns for the table
  const columns: TableColumn[] = [
    {
      key: 'unit',
      header: 'Business Unit',
      width: '45%',
      align: 'left'
    },
    {
      key: 'value',
      header: metric.charAt(0).toUpperCase() + metric.slice(1),
      type: 'currency',
      width: '25%',
      align: 'right'
    },
    {
      key: 'share',
      header: 'Share',
      type: 'percent',
      width: '15%',
      align: 'right'
    }
  ];

  // Add bar chart column if enabled
  if (showBarChart) {
    columns.push({
      key: 'bar',
      header: '',
      type: 'bar',
      width: '15%'
    });
  }

  // Format the title including metric and period
  const widgetTitle = `${title || `${metric.charAt(0).toUpperCase() + metric.slice(1)} by Business Unit`} (${period})`;

  return (
    <TableWidget
      title={widgetTitle}
      columns={columns}
      rows={tableRows}
      showBarChart={showBarChart}
      maxValue={100} // Share values are percentages (0-100)
    />
  );
};

export default MetricBreakdown;
