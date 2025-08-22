# Fallback MVP - Financial Dashboard

A responsive financial data dashboard with a chat assistant, featuring business unit performance metrics, monthly trends, and counterparty insights.

## Features

- **Interactive Dashboard** with multiple data widgets
- **Chat Assistant** for financial data queries with Perplexity AI grounding
- **Live BigQuery Integration** for real-time financial data
- **Business Unit Performance** metrics and trends
- **Monthly Revenue Trends** visualization
- **Top Counterparty** analysis

## Development Setup

### Prerequisites

- Node.js (v16+)
- npm or yarn

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/rolodexter/fallback-mvp.git
   cd fallback-mvp
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Start the development server
   ```bash
   npm run dev
   ```

4. Open your browser to `http://localhost:5173`

### Development Mode Features

- **Mock Service Worker (MSW)** automatically intercepts API calls in development mode
- **Mock Chat API** provides realistic responses without needing an actual API key
- **Improved Error Handling** for API calls and data fetching

## Production Setup

### Environment Variables

Create a `.env` file in the root directory based on the `.env.example` file:

```
# LLM Provider Configuration
PROVIDER=perplexity
PERPLEXITY_API_KEY=your-key-here

# BigQuery Configuration
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Deployment Platform Configuration
# Options: netlify, vercel
VITE_DEPLOY_PLATFORM=netlify
```

#### Environment Variable Details

- `PROVIDER`: Specifies which LLM provider to use (currently only 'perplexity' is supported)
- `PERPLEXITY_API_KEY`: Your API key from Perplexity AI (required for production)
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to your Google Cloud service account key file (required for BigQuery)
- `VITE_DEPLOY_PLATFORM`: Sets the deployment platform for client-side endpoint detection

### Deployment Options

- **Vercel**: Uses `/api` endpoints
- **Netlify**: Uses `/.netlify/functions` endpoints

The application automatically detects the deployment platform and uses the appropriate API endpoints.

## Architecture

- **Frontend**: React with TypeScript
- **Chat**: Chat client service with automatic platform detection and Perplexity AI grounding
- **Data Widgets**: Component-based dashboard widgets with live BigQuery data
- **API**: Serverless functions for Vercel and Netlify
- **Data**: BigQuery integration with parameterized SQL templates

## BigQuery Integration

### Setup

1. Create a Google Cloud project and enable the BigQuery API

2. Create a service account with BigQuery permissions:
   - Go to Google Cloud Console > IAM & Admin > Service Accounts
   - Create a new service account
   - Grant it the "BigQuery User" and "BigQuery Data Viewer" roles
   - Create and download a JSON key file

3. Set the environment variable in your `.env` file:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-service-account-key.json
   ```

4. For deployment platforms:
   - **Vercel**: Add the GOOGLE_APPLICATION_CREDENTIALS as a JSON string in environment variables
   - **Netlify**: Use Netlify environment variables to store the JSON credentials

### SQL Templates

The application uses parameterized SQL templates stored in the `sql/` directory:

- `business_units_snapshot_yoy_v1.sql`: Business unit performance with year-over-year comparison
- `customers_top_n.sql`: Top customers by revenue with parameter for limit
- `risks_summary.sql`: Risk assessment summary metrics

To add new templates:
1. Add SQL file to the `sql/` directory
2. Update the mapping in `src/services/chatClient.ts` to route domains to the new template
3. Create a corresponding widget component if needed

## Troubleshooting

- If chat isn't working in production, check that the `PERPLEXITY_API_KEY` is properly set
- For development, MSW handles API mocking so no API key is required
- If widgets aren't loading data, check the network requests for correct URL paths
- If BigQuery integration is failing, verify your `GOOGLE_APPLICATION_CREDENTIALS` path and permissions