# Router Strategy: Live Data Integration

This document outlines the routing strategy for integrating live BigQuery data with the chat interface and widget components.

## Overview

The Fallback MVP uses a domain-based routing system to:
1. Detect the topic domain of user messages
2. Route queries to appropriate BigQuery templates
3. Retrieve live data for grounding responses
4. Fall back gracefully when data is unavailable

## Domain Detection Flow

```
User Message → detectTopic() → routeMessage() → Domain + Confidence Score
```

The router performs keyword-based matching to determine which domain a user's message belongs to, and assigns a confidence score. If the confidence threshold is met, the message is routed to the appropriate domain handler.

## Data Flow with BigQuery Integration

The updated data flow with live BigQuery integration:

```
                 ┌─────────────┐
                 │  User Query │
                 └──────┬──────┘
                        │
                        ▼
               ┌─────────────────┐
               │  Domain Router  │
               └────────┬────────┘
                        │
                        ▼
               ┌─────────────────┐
               │ Domain Detected │
               └────────┬────────┘
                        │
                        ▼
          ┌────────────────────────────┐
          │ Map Domain to SQL Template │
          └─────────────┬──────────────┘
                        │
                        ▼
               ┌─────────────────┐
               │ Execute BigQuery│
               └────────┬────────┘
                        │
                        ▼
                ┌───────────────┐
         ┌──────│  Data Check   │──────┐
         │      └───────────────┘      │
         │                             │
         ▼                             ▼
┌─────────────────┐           ┌─────────────────┐
│   Data Found    │           │   No Data       │
└────────┬────────┘           └────────┬────────┘
         │                             │
         ▼                             ▼
┌─────────────────┐           ┌─────────────────┐
│ Ground Response │           │ Fallback Mode   │
└────────┬────────┘           └────────┬────────┘
         │                             │
         └──────────┬──────────────────┘
                    │
                    ▼
           ┌─────────────────┐
           │  LLM Response   │
           └─────────────────┘
```

## Domain to Template Mapping

| Domain          | SQL Template                     | Grounding Type |
|-----------------|----------------------------------|---------------|
| performance     | business_units_snapshot_yoy_v1   | intro         |
| counterparties  | customers_top_n                  | intro         |
| risk            | risks_summary                    | intro         |
| *specific query | *same as domain + params         | drilldown     |
| none/unknown    | none                             | null          |
| query error     | none                             | no_data       |

## Perplexity AI Integration

When a domain is detected and data is available:
1. The router maps the domain to a BigQuery template
2. The BigQuery template is executed with appropriate parameters
3. The result rows are structured as JSON and passed to Perplexity AI
4. The LLM generates a grounded narrative response based on the data

## Fallback Strategy

If BigQuery data retrieval fails:
1. The client code falls back to static JSON data for widgets
2. The chat response uses a special `no_data` system prompt
3. The LLM explains what data would typically be available
4. The response suggests alternative queries

## Implementation Details

### 1. Domain Detection
- Located in `src/data/router/router.ts`
- Uses keyword matching with confidence scoring
- Returns domain, confidence score, and grounding type

### 2. BigQuery Integration
- Chat client maps domains to SQL templates
- Executes BigQuery queries via serverless functions
- Handles query parameters based on user intent

### 3. Perplexity Grounding
- Embeds BigQuery JSON data in the message payload
- Uses a specialized system prompt for data grounding
- Formats responses in executive business language

### 4. Error Handling
- Provides graceful fallbacks for all failure points
- Gives transparent feedback about data availability
- Preserves conversation flow even when data is missing
