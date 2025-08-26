# Non-interactive Netlify deployment script for Windsurf app
# Uses token-based authentication to avoid interactive prompts

# Set environment variables for token-based authentication
$env:NETLIFY_AUTH_TOKEN="PASTE_YOUR_TOKEN_HERE"  # Replace with your actual token
$env:NETLIFY_CLI_DISABLE_UPDATE_CHECK="1"

# Set Stage A environment variables
$env:DATA_MODE="mock"
$env:PROVIDER="perplexity"
$env:PERPLEXITY_API_KEY="your_api_key_here"  # Replace with your actual API key
$env:POLISH_NARRATIVE="false"
# IMPORTANT: Point Windsurf static frontend to your Netlify API base (site URL)
# Example: https://your-site.netlify.app
$env:VITE_API_BASE="https://your-site.netlify.app"  # Replace with your actual Netlify site URL

# Install Netlify CLI if needed
npm i -g netlify-cli

# Verify Netlify CLI and authentication
netlify --version
netlify status --json

# Link to existing Netlify site using the project ID from windsurf_deployment.yaml
netlify link --id bef90b9f-7b58-454c-814e-4902f3456ac2

# Set Netlify environment variables
netlify env:set DATA_MODE mock
netlify env:set PROVIDER perplexity
netlify env:set PERPLEXITY_API_KEY your_api_key_here  # Replace with your actual API key
netlify env:set POLISH_NARRATIVE false
netlify env:set VITE_API_BASE $env:VITE_API_BASE

# Build the application
npm ci
npm run build

# Deploy to Netlify production
netlify deploy --dir=dist --functions=netlify/functions --prod --message "Windsurf Stage A mock deploy"
