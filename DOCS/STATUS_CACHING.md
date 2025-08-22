# BigQuery Caching Status

## Cache Implementation

The Fallback MVP now includes a caching layer for BigQuery calls with two supported backends:

1. **In-memory cache** (default)
   - Automatically used if Redis is not configured
   - Persists only within the current server instance
   - Lost on server restarts

2. **Upstash Redis cache** (configurable)
   - Enabled when `REDIS_URL` and `REDIS_TOKEN` environment variables are set
   - Persistent across server restarts and multiple instances
   - Shared cache for distributed environments

## Configuration

Cache settings and behavior:

- **Default TTL**: 900 seconds (15 minutes)
- **Cache key format**: `bq:{template_id}:{stable_hash_of_params}`
- **Cache miss behavior**: Execute BigQuery query with guardrails, then cache result
- **Cache hit behavior**: Return cached result immediately

## Performance Metrics

### Expected Performance Improvements

| Scenario | Without Cache | With Cache | Improvement |
|----------|---------------|------------|-------------|
| First query | 1500-2500ms | 1500-2500ms | None (cold start) |
| Subsequent identical query | 1500-2500ms | 50-150ms | ~95% reduction |
| Different query, same template | 1500-2500ms | 1500-2500ms | None |

### Cost Benefits

- **Reduced BigQuery costs**: Fewer query executions for identical parameters
- **Improved user experience**: Faster response times for repeated queries
- **Lower API limits risk**: Less chance of hitting BigQuery API rate limits

## Diagnostics

The BigQuery function now includes enhanced diagnostics:

- `bytesProcessed`: Number of bytes processed by the query (when not cached)
- `jobId`: BigQuery job ID for tracking and auditing
- `cacheHit`: Boolean indicating if result was served from cache
- `executionTime`: Time taken to execute the query (when not cached)

## Guardrails

Added protection mechanisms:

- **Maximum bytes billed**: Limited to 1GB per query
- **Query timeout**: 15 seconds maximum execution time
- **Error handling**: Graceful fallback with informative errors

## Known Issues

- In-memory cache is not shared between serverless function instances
- Cache is not automatically invalidated when data changes in BigQuery
- No cache warming or prefetching mechanism currently implemented
- No cache size limits implemented for in-memory cache

## Next Steps

- Implement cache statistics tracking (hits/misses ratio)
- Add cache control headers for browser-side caching where appropriate
- Consider adding cache invalidation endpoints for admin use
- Explore fine-tuning TTL values per template
