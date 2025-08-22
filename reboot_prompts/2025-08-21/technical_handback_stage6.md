# Fallback MVP - Stage 6 Technical Handback

## Overview

Stage 6 focused on implementing a caching layer for BigQuery queries, adding new SQL templates for profitability and regional revenue analysis, enhancing the router with new domains, and implementing diagnostics and guardrails. This document summarizes the changes, new features, and their technical implementation.

## Caching Implementation

### Cache Abstraction (src/lib/cache.ts)

- **Dual Backend Support**: 
  - In-memory cache (default)
  - Upstash Redis cache (when configured via environment variables)

- **Interface**: 
  ```typescript
  async get(key: string): Promise<T | null>
  async set(key: string, value: T, ttl?: number): Promise<void>
  ```

- **Cache Key Format**: `bq:{template_id}:{stable_hash_of_params}`
  - Stable hash ensures consistent keys regardless of parameter order
  - Template-specific prefixing allows for domain-specific cache management

- **Default TTL**: 15 minutes (900 seconds)

### Integration in BigQuery Function

- **Cache Hit Path**:
  1. Generate stable hash of query parameters
  2. Check cache for results using combined key
  3. If found, return cached results with cache hit diagnostic
  
- **Cache Miss Path**:
  1. Execute BigQuery query with guardrails
  2. Store results in cache with default TTL
  3. Return results with cache miss diagnostic

## New SQL Templates

### Profitability by Business Unit (profitability_by_business_unit_v1.sql)

- **Domain**: `profitability`
- **Schema**: `profit_v1`
- **Parameters**: `year` (defaults to previous year)
- **Data Returned**: Business unit revenue, COGS, gross margin, and margin percentage

### Regional Revenue Trends (regional_revenue_trend_24m_v1.sql)

- **Domain**: `regional`
- **Schema**: `region_v1`
- **Parameters**: Optional `region` filter
- **Data Returned**: 24-month revenue trends by region with monthly data points

## Router Enhancements

- **New Domains**:
  - `profitability`: Keywords related to profit, margin, business unit financials
  - `regional`: Keywords related to geographical performance, regional trends

- **Domain to Template Mapping**:
  - `profitability` → `profitability_by_business_unit_v1`
  - `regional` → `regional_revenue_trend_24m_v1`

## Diagnostics & Guardrails

### Query Diagnostics

- **Fields Added**:
  - `bytesProcessed`: Data size processed by BigQuery
  - `jobId`: BigQuery job identifier
  - `cacheHit`: Boolean indicating if result came from cache
  - `executionTime`: Time taken to execute query (when not cached)

### Query Guardrails

- **Maximum Bytes Billed**: 1GB per query
- **Query Timeout**: 15 seconds
- **Error Handling**: Graceful degradation with informative messages

## Documentation

- **STATUS_CACHING.md**: Details on cache implementation, expected performance improvements
- **TEMPLATES_PROFIT_REGION.md**: Documentation for new SQL templates
- **README.md**: Updated with cache configuration options and new templates

## Testing Notes

The following manual tests should be performed to validate the implementation:

1. **Cache Hit Verification**:
   - Execute same query twice in succession
   - Verify second query returns `cacheHit: true` in diagnostics
   - Confirm faster response time on second query

2. **Template Validation**:
   - Test profitability queries (e.g., "Show me profitability by business unit")
   - Test regional queries (e.g., "What's the revenue trend in Patagonia?")
   - Verify correct template selection and data return

3. **Cache Backend Testing**:
   - Test with in-memory cache (default)
   - Test with Redis cache (requires environment variables)

4. **Guardrails Testing**:
   - Verify timeout works (create a slow query)
   - Verify maximum bytes protection

## Known Issues

- In-memory cache doesn't persist across serverless function instances
- No cache invalidation mechanism implemented
- TypeScript warnings related to debug object properties (resolved via type casting)

## Next Steps

1. **Cache Monitoring**: Implement hit rate tracking
2. **Cache Control**: Add cache invalidation endpoints
3. **Template Parameters**: Add more parameter support to SQL templates
4. **Visualization**: Create new chart components for profitability and regional data

## Deployment URLs

- **Netlify**: https://fallback-mvp.netlify.app
- **Vercel**: https://fallback-mvp.vercel.app

## Environment Variables

For production deployment, ensure the following environment variables are configured:

```
# LLM Provider Configuration
PROVIDER=perplexity
PERPLEXITY_API_KEY=your-key-here

# BigQuery Configuration
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Deployment Platform Configuration
VITE_DEPLOY_PLATFORM=netlify|vercel

# Cache Configuration (Optional)
REDIS_URL=https://your-redis-instance.upstash.io
REDIS_TOKEN=your-redis-token-here
```
