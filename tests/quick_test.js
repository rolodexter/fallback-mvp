// Quick test to verify chat function works after fixing PROVIDER vs LLM_PROVIDER
const fetch = require('node-fetch');

async function testChatFunction() {
  console.log("Starting chat function test...");
  
  try {
    const response = await fetch('http://localhost:8888/.netlify/functions/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: "Tell me about business unit Z001",
        history: []
      })
    });
    
    if (!response.ok) {
      console.error(`Error status: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error("Error response:", errorText);
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
