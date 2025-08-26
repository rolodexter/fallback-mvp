import React from 'react';
import './Widget.css';

// Define the table cell data types
export type CellType = 'text' | 'number' | 'currency' | 'percent' | 'bar';

export interface TableColumn {
  key: string;
  header: string;
  type?: CellType;
  width?: string;
  align?: 'left' | 'right' | 'center';
  formatter?: (value: any) => string;
}

interface TableRow {
  id: string;
  [key: string]: any;
}

interface BarChartProps {
  value: number;
  max: number;
  color?: string;
}

interface TableWidgetProps {
  title: string;
  columns: TableColumn[];
  rows: TableRow[];
  showBarChart?: boolean;
  maxValue?: number; // Used for bar chart scaling
}

// Simple bar chart component for displaying percentages
const BarChart: React.FC<BarChartProps> = ({ value, max, color = '#0ea5e9' }) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  return (
    <div className="bar-chart-container">
      <div 
        className="bar-chart-fill" 
        style={{ 
          width: `${percentage}%`,
          backgroundColor: color
        }}
      />
    </div>
  );
};

// Format number as currency
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

// Format number as percentage
const formatPercent = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value / 100);
};

// TableWidget component for displaying tabular data
const TableWidget: React.FC<TableWidgetProps> = ({
  title,
  columns,
  rows,
  showBarChart = false,
  maxValue
}) => {
  // Calculate max value for bar chart if not provided
  const calculatedMax = maxValue || Math.max(...rows.map(row => 
    Math.max(...columns.map(col => 
      typeof row[col.key] === 'number' ? row[col.key] : 0
    ))
  ));

  return (
    <div className="widget table-widget">
      <div className="widget-header">
        <h3 className="widget-title">{title}</h3>
      </div>
      <div className="widget-content">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map(column => (
                <th 
                  key={column.key}
                  className={`table-header ${column.align ? `align-${column.align}` : ''}`}
                  style={{ width: column.width }}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="table-row">
                {columns.map(column => {
                  let cellContent;
                  const value = row[column.key];
                  
                  // Format cell based on column type
                  switch (column.type) {
                    case 'currency':
                      cellContent = formatCurrency(value);
                      break;
                    case 'percent':
                      cellContent = formatPercent(value);
                      break;
                    case 'number':
                      cellContent = column.formatter ? column.formatter(value) : value.toLocaleString();
                      break;
                    case 'bar':
                      return (
                        <td key={column.key} className={`table-cell ${column.align ? `align-${column.align}` : ''}`}>
                          <BarChart value={value} max={calculatedMax} />
                        </td>
                      );
                    default:
                      cellContent = column.formatter ? column.formatter(value) : value;
                  }
                  
                  return (
                    <td 
                      key={column.key} 
                      className={`table-cell ${column.align ? `align-${column.align}` : ''} ${column.type ? `cell-${column.type}` : ''}`}
                    >
                      {cellContent}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TableWidget;
