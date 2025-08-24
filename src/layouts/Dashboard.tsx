import React from 'react';
import ChatPanel from '../components/chat/ChatPanel';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Fallback MVP Dashboard</h1>
      </header>
      <div className="chat-container">
        <ChatPanel />
      </div>
    </div>
  );
};

export default Dashboard;
