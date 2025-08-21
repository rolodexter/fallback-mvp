import React, { useState } from 'react';
import './ChatPanel.css';

const ChatPanel: React.FC = () => {
  const [message, setMessage] = useState('');
  
  return (
    <div className="chat-panel">
      <h2>Chat Panel</h2>
      <div className="chat-messages">
        {/* Messages will be displayed here in Stage 2 */}
      </div>
      <div className="chat-input">
        <textarea 
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message here..."
        />
        <button disabled>Send</button>
      </div>
    </div>
  );
};

export default ChatPanel;
