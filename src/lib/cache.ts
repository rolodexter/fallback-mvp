import { createHash } from 'crypto';

// Cache interface
export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
}

// In-memory cache implementation
class MemoryCache implements Cache {
  private cache: Map<string, { value: string; expiry: number }> = new Map();

  async get(key: string): Promise<string | null> {
    const item = this.cache.get(key);
    if (!item) return null;

    const now = Date.now();
    if (item.expiry < now) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    const expiry = Date.now() + ttlSec * 1000;
    this.cache.set(key, { value, expiry });
  }
}

// Redis cache implementation
class RedisCache implements Cache {
  private redisUrl: string;
  private redisToken: string;

  constructor(redisUrl: string, redisToken: string) {
    this.redisUrl = redisUrl;
    this.redisToken = redisToken;
  }

  async get(key: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.redisUrl}/${key}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.redisToken}`
        }
      });

      if (!response.ok) return null;
      const data = await response.json();
      return data.result;
    } catch (error) {
      console.error('Redis cache get error:', error);
      return null;
    }
  }

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    try {
      await fetch(`${this.redisUrl}/${key}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.redisToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value,
          ex: ttlSec
        })
      });
    } catch (error) {
      console.error('Redis cache set error:', error);
    }
  }
}

// Default TTL in seconds
export const DEFAULT_TTL = 900; // 15 minutes

// Factory function to create appropriate cache
export function createCache(): Cache {
  const redisUrl = process.env.REDIS_URL;
  const redisToken = process.env.REDIS_TOKEN;

  if (redisUrl && redisToken) {
    console.log('Using Redis cache');
    return new RedisCache(redisUrl, redisToken);
  } else {
    console.log('Using in-memory cache');
    return new MemoryCache();
  }
}

// Helper function to generate stable hash of parameters
export function generateStableHash(params: Record<string, any>): string {
  const stringified = JSON.stringify(params);
  const hash = createHash('sha256').update(stringified).digest('hex');
  return hash.substring(0, 16); // Use first 16 chars for brevity
}

// Singleton cache instance
let cacheInstance: Cache | null = null;

// Get cache instance (singleton pattern)
export function getCache(): Cache {
  if (!cacheInstance) {
    cacheInstance = createCache();
  }
  return cacheInstance;
}
