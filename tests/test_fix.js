// Script to test 502 error fix after environment variable renaming
const fetch = require('node-fetch');

async function testChatFunction() {
  console.log("Starting chat function test...");
  
  try {
    // Using the correct netlify function endpoint
    const response = await fetch('http://localhost:8888/.netlify/functions/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: "Show me the top business units by revenue",
        history: []
      })
    });
    
    console.log(`Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      console.error(`Error status: ${response.status} ${response.statusText}`);
      try {
        const errorText = await response.text();
        console.error("Error response:", errorText);
      } catch (e) {
        console.error("Could not read error response");
      }
      return;
    }
    
    const data = await response.json();
    console.log("Response received successfully!");
    console.log("Response structure:", JSON.stringify(data, null, 2).substring(0, 300) + "...");
    console.log("Test completed successfully!");
  } catch (error) {
    console.error("Test failed with error:", error);
  }
}

testChatFunction();
