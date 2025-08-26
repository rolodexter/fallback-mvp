/**
 * Data Source Checker Utility
 * 
 * This utility helps verify if the application is using live BigQuery data
 * or mock data by making a request and checking the provenance.
 * 
 * To use in the browser console:
 *   1. checkDataSource() - Run a test query and verify data source
 *   2. toggleDataMode() - Toggle between 'mock' and 'bq' modes (requires server restart)
 */

// Store the current data mode for toggling
let currentDataMode = 'unknown';

// Check current data source by making a sample query
async function checkDataSource() {
  console.log('🔍 Checking data source...');
  
  try {
    // Use the chat client to send a simple query
    const response = await window.chatClient.sendChat('Show revenue breakdown by business unit', []);
    
    // Extract data source information
    const source = response?.provenance?.source?.toLowerCase() || 'unknown';
    currentDataMode = source;
    
    console.log(`✅ Data source detected: ${source}`);
    console.log(`${source === 'bq' ? '🔵 LIVE DATA' : '🟠 MOCK DATA'}`);
    
    // Show detailed provenance for debugging
    console.log('Detailed provenance:', response?.provenance);
    
    return {
      dataSource: source,
      isLive: source === 'bq',
      isMock: source === 'mock',
      provenance: response?.provenance
    };
  } catch (error) {
    console.error('❌ Error checking data source:', error);
    return { error: error.message || 'Unknown error' };
  }
}

// Get current environment variables (for display only)
async function getEnvConfig() {
  try {
    const response = await fetch('/api/health');
    const data = await response.json();
    console.log('Current environment configuration:', data.env);
    return data.env;
  } catch (error) {
    console.error('Error fetching environment config:', error);
    return { error: error.message };
  }
}

// Create a detailed test report
async function createTestReport() {
  console.log('📊 Generating data source test report...');
  
  const sourceCheck = await checkDataSource();
  const envConfig = await getEnvConfig();
  
  console.log('\n====== DATA SOURCE TEST REPORT ======');
  console.log(`Data Source: ${sourceCheck.dataSource || 'Unknown'}`);
  console.log(`Using Live Data: ${sourceCheck.isLive ? 'Yes ✅' : 'No ❌'}`);
  console.log(`DATA_MODE env: ${envConfig.DATA_MODE || 'Not available'}`);
  console.log('======================================\n');
  
  return {
    dataSource: sourceCheck,
    envConfig: envConfig
  };
}

// Make functions available globally
window.checkDataSource = checkDataSource;
window.getEnvConfig = getEnvConfig;
window.createTestReport = createTestReport;

console.log('\n🔍 Data Source Checker loaded! Run tests with: createTestReport()');
