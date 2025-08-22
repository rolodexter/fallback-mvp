# Fallback MVP - Financial Dashboard

A responsive financial data dashboard with a chat assistant, featuring business unit performance metrics, monthly trends, and counterparty insights.

## Features

- **Interactive Dashboard** with multiple data widgets
- **Chat Assistant** for financial data queries
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

# Deployment Platform Configuration
# Options: netlify, vercel
VITE_DEPLOY_PLATFORM=netlify
```

#### Environment Variable Details

- `PROVIDER`: Specifies which LLM provider to use (currently only 'perplexity' is supported)
- `PERPLEXITY_API_KEY`: Your API key from Perplexity AI (required for production)
- `VITE_DEPLOY_PLATFORM`: Sets the deployment platform for client-side endpoint detection

### Deployment Options

- **Vercel**: Uses `/api` endpoints
- **Netlify**: Uses `/.netlify/functions` endpoints

The application automatically detects the deployment platform and uses the appropriate API endpoints.

## Architecture

- **Frontend**: React with TypeScript
- **Chat**: Chat client service with automatic platform detection
- **Data Widgets**: Component-based dashboard widgets
- **API**: Serverless functions for Vercel and Netlify

## Troubleshooting

- If chat isn't working in production, check that the `PERPLEXITY_API_KEY` is properly set
- For development, MSW handles API mocking so no API key is required
- If widgets aren't loading data, check the network requests for correct URL paths