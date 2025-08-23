# Environment Setup Guide

This document outlines the environment variables needed to run the application in mock data mode.

## Required Environment Variables

| Variable | Description | Required in Mock Mode | Required in Live Mode |
|----------|-------------|:---------------------:|:---------------------:|
| `DATA_MODE` | Set to `mock` for mock data mode or `live` for BigQuery integration | Yes | Yes |
| `PROVIDER` | LLM provider (currently only `perplexity` is supported) | Yes | Yes |
| `PERPLEXITY_API_KEY` | API key for Perplexity AI | Yes | Yes |
| `POLISH_NARRATIVE` | Whether to apply LLM polishing to template outputs (true/false) | Optional | Optional |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to GCP service account credentials JSON | No | Yes |

## Mock Mode Configuration

For mock data mode, set up your `.env` file with the following variables:

```
DATA_MODE=mock
PROVIDER=perplexity
PERPLEXITY_API_KEY=your_api_key_here
POLISH_NARRATIVE=true  # Optional, defaults to false
```

## Live Mode Configuration

For live mode with BigQuery integration, set up your `.env` file with:

```
DATA_MODE=live
PROVIDER=perplexity
PERPLEXITY_API_KEY=your_api_key_here
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-credentials.json
POLISH_NARRATIVE=true  # Optional
```

## Notes

1. The `POLISH_NARRATIVE` feature will make an additional LLM call to improve the quality of template-generated text, which adds latency but may improve response quality.

2. When `POLISH_NARRATIVE=true`, the system will still fall back to the original template text if polishing fails.

3. In mock mode, the application will not attempt to connect to BigQuery and will use local JSON files for data.
