import React from 'react';
import BusinessUnits from '../components/widgets/BusinessUnits';
import TopCounterparties from '../components/widgets/TopCounterparties';
import MonthlyTrend from '../components/widgets/MonthlyTrend';
import ChatPanel from '../components/chat/ChatPanel';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Fallback MVP Dashboard</h1>
      </header>
      <div className="widgets-container">
        <BusinessUnits />
        <TopCounterparties />
        <MonthlyTrend />
      </div>
      <div className="chat-container">
        <ChatPanel />
      </div>
    </div>
  );
};

export default Dashboard;
