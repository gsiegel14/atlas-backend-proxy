# Comprehensive API Caching Strategy

## Overview
Implement a multi-layer caching strategy to eliminate repetitive API calls and prevent rate limiting issues across all endpoints.

## Problem Summary
- **Rate Limiting**: 429 errors on media, transcription, and upload endpoints
- **Repetitive Calls**: Same data requested multiple times per session
- **Large Payloads**: 4.3MB profile photos downloaded repeatedly
- **Dashboard Load**: 8+ API calls every time dashboard loads

## 1. Backend Server-Side Caching

### A. Patient Dashboard Cache
- **Cache Key**: `dashboard:${userId}`
- **TTL**: 5 minutes (configurable)
- **Storage**: Redis (already available)
- **Invalidation**: On patient data updates
- **Benefit**: Eliminates repetitive REST API calls to Foundry

```javascript
// Example structure
const dashboardCache = {
  key: `dashboard:${userId}`,
  data: {
    patient: { /* patient profile */ },
    stats: { /* dashboard statistics */ },
    profilePhotoUrl: '/api/v1/foundry/media/.../content',
    lastUpdated: timestamp
  },
  ttl: 300 // 5 minutes
};
```

### B. Media Content Cache (Priority Fix)
- **Cache Key**: `media:${mediaSetRid}:${mediaItemRid}`
- **TTL**: 24 hours (profile photos rarely change)
- **Storage**: Redis for metadata, disk/CDN for binary data
- **Cache Headers**: `Cache-Control: private, max-age=86400, immutable`
- **ETag Support**: For conditional requests

### C. Patient Profile Search Cache
- **Cache Key**: `profile:search:${searchValue}`
- **TTL**: 30 minutes
- **Storage**: Redis
- **Includes**: All search field results

### D. Clinical Data Caches
Each endpoint gets its own cache with appropriate TTL:

| Endpoint | Cache Key | TTL | Notes |
|----------|-----------|-----|-------|
| Conditions | `conditions:${userId}:${pageSize}:${sort}` | 15 min | Changes infrequently |
| Encounters | `encounters:${userId}:${pageSize}:${sort}` | 10 min | Updated with visits |
| Observations | `observations:${userId}:${category}:${pageSize}` | 5 min | Vitals change often |
| Procedures | `procedures:${userId}:${pageSize}:${sort}` | 30 min | Historical data |
| Clinical Notes | `notes:${userId}:${pageSize}:${sort}` | 10 min | Provider updates |
| Medications | `medications:${userId}:${pageSize}` | 15 min | Prescription changes |

### E. AI Chat History Cache
- **Cache Key**: `chat:history:${userId}:${pageSize}`
- **TTL**: 2 minutes (real-time feel)
- **Storage**: Redis
- **Invalidation**: On new chat message

### F. Transcription Summary Cache
- **Cache Key**: `transcription:${userId}:${hash(transcript)}`
- **TTL**: 1 hour (LLM responses don't change)
- **Storage**: Redis
- **Benefit**: Avoid re-processing same transcript

## 2. Request Coalescing (Prevent Duplicate Concurrent Requests)

### Implementation for High-Traffic Endpoints
```javascript
class RequestCoalescer {
  constructor() {
    this.pending = new Map();
  }
  
  async coalesce(key, fetchFn) {
    if (this.pending.has(key)) {
      return this.pending.get(key);
    }
    
    const promise = fetchFn().finally(() => {
      this.pending.delete(key);
    });
    
    this.pending.set(key, promise);
    return promise;
  }
}

// Usage example for media endpoint
const mediaCoalescer = new RequestCoalescer();

router.get('/media/:mediaSetRid/items/:mediaItemRid/content', async (req, res) => {
  const key = `${req.params.mediaSetRid}:${req.params.mediaItemRid}`;
  
  const content = await mediaCoalescer.coalesce(key, async () => {
    // Check cache first
    const cached = await cacheService.getMedia(mediaSetRid, mediaItemRid);
    if (cached) return cached;
    
    // Fetch from Foundry
    const fresh = await foundryService.getMediaContent(mediaSetRid, mediaItemRid);
    await cacheService.setMedia(mediaSetRid, mediaItemRid, fresh.content, fresh.contentType);
    return fresh;
  });
  
  res.set('Content-Type', content.contentType);
  res.send(content.content);
});
```

## 3. HTTP Cache Headers Implementation

### A. Media Content Headers
```javascript
// For media content (profile photos, audio files)
res.set({
  'Cache-Control': 'private, max-age=86400, immutable', // 24 hours
  'ETag': generateETag(content),
  'Last-Modified': lastModifiedDate,
  'X-Content-Type-Options': 'nosniff'
});
```

### B. API Data Headers
```javascript
// For dashboard and clinical data
res.set({
  'Cache-Control': 'private, max-age=300, must-revalidate', // 5 minutes
  'ETag': generateETag(data),
  'Vary': 'Authorization'
});
```

### C. Real-time Data Headers
```javascript
// For chat history and observations
res.set({
  'Cache-Control': 'private, no-cache, must-revalidate',
  'ETag': generateETag(data)
});
```

## 3. iOS Client-Side Caching

### A. URLCache Configuration
```swift
// Configure shared URL cache
let memoryCapacity = 50 * 1024 * 1024 // 50 MB
let diskCapacity = 200 * 1024 * 1024 // 200 MB
let cache = URLCache(
    memoryCapacity: memoryCapacity,
    diskCapacity: diskCapacity,
    diskPath: "com.atlas.cache"
)
URLCache.shared = cache
```

### B. In-Memory Cache for Active Session
```swift
class PatientDashboardCache {
    static let shared = PatientDashboardCache()
    private var cache: [String: (data: DashboardData, timestamp: Date)] = [:]
    private let cacheTimeout: TimeInterval = 300 // 5 minutes
    
    func getCachedDashboard(for userId: String) -> DashboardData? {
        guard let cached = cache[userId],
              Date().timeIntervalSince(cached.timestamp) < cacheTimeout else {
            return nil
        }
        return cached.data
    }
    
    func cacheDashboard(_ data: DashboardData, for userId: String) {
        cache[userId] = (data, Date())
    }
}
```

### C. Image Caching with SDWebImage or Kingfisher
```swift
// Using SDWebImage
imageView.sd_setImage(
    with: profilePhotoURL,
    placeholderImage: UIImage(named: "placeholder"),
    options: [.refreshCached, .retryFailed]
)
```

## 4. Rate Limiting Fixes

### A. Fix Double Count Error
```javascript
// In server.js - Remove duplicate rate limiters
app.use('/api/v1/foundry', createRateLimiter(200, redisClient)); // Increased limit
// Remove the duplicate: app.use('/api/v1/foundry', createRateLimiter(100, redisClient), transcriptionSummaryRouter);
```

### B. Separate Rate Limits by Operation Type
```javascript
// Read operations - higher limit
const readRateLimit = createRateLimiter(300, redisClient); // 300/min

// Write operations - moderate limit  
const writeRateLimit = createRateLimiter(100, redisClient); // 100/min

// Media operations - special handling
const mediaRateLimit = createRateLimiter(500, redisClient); // 500/min for cached content

// Apply different limits
app.use('/api/v1/foundry/media', mediaRateLimit);
app.get('/api/v1/foundry/*', readRateLimit);
app.post('/api/v1/foundry/transcription-summary', writeRateLimit);
app.post('/api/v1/foundry/media/upload', uploadRateLimit);
```

## 5. Implementation Priority

### Phase 1: Immediate Fixes (Today)
1. **Fix Rate Limiting Configuration**
   - Fix double count error
   - Increase limits for media endpoints
   - Separate read/write limits

2. **Implement Media Content Caching**
   - Add Redis caching for profile photos
   - Add HTTP cache headers
   - Implement request coalescing

3. **Cache Patient Dashboard**
   - Cache full dashboard response
   - Reduce REST API calls

### Phase 2: Quick Wins (1-2 days)
1. **Cache Clinical Data Endpoints**
   - Conditions, Encounters, Observations
   - Procedures, Clinical Notes
   - Use appropriate TTLs

2. **Add Request Coalescing**
   - Prevent duplicate concurrent requests
   - Implement for all high-traffic endpoints

3. **Configure iOS URLCache**
   - Increase cache size
   - Honor HTTP cache headers

### Phase 3: Optimize (3-5 days)
1. **Implement Comprehensive Caching Service**
   - Transcription summary caching
   - AI chat history caching
   - Profile search caching

2. **Add Cache Warming**
   - Pre-load dashboard on login
   - Background refresh before TTL expires

3. **Implement Cache Invalidation**
   - Pub/sub for real-time updates
   - Smart invalidation strategies

## 5. Cache Invalidation Strategy

### Events that trigger cache invalidation:
1. Patient profile update
2. New medical records added
3. Photo upload
4. Explicit user refresh

### Implementation:
```javascript
// Redis pub/sub for cache invalidation
redisClient.publish('cache-invalidate', JSON.stringify({
  type: 'dashboard',
  userId: userId,
  reason: 'profile-update'
}));
```

## 6. Monitoring and Metrics

### Track:
- Cache hit/miss ratios
- API call reduction percentage
- Response time improvements
- Rate limit incidents

### Example metrics:
```javascript
logger.info('Cache performance', {
  endpoint: '/api/v1/patient/dashboard',
  cacheHit: true,
  responseTime: 15, // ms
  apiCallsSaved: 1
});
```

## 7. Concrete Implementation Examples

### A. Dashboard Endpoint with Caching
```javascript
router.post('/dashboard', validateTokenWithScopes(['read:patient']), async (req, res, next) => {
  try {
    const userId = req.user?.sub;
    
    // Check cache first
    const cached = await cacheService.getDashboard(userId);
    if (cached) {
      logger.info('Dashboard cache hit', { userId });
      return res.json(cached);
    }
    
    // Existing dashboard logic...
    const dashboardData = await fetchDashboardData(userId);
    
    // Cache the response
    await cacheService.setDashboard(userId, dashboardData);
    
    res.json(dashboardData);
  } catch (error) {
    next(error);
  }
});
```

### B. Media Endpoint with Caching and Coalescing
```javascript
router.get('/media/:mediaSetRid/items/:mediaItemRid/content', 
  validateTokenWithScopes(['read:patient']), 
  async (req, res, next) => {
    try {
      const { mediaSetRid, mediaItemRid } = req.params;
      const cacheKey = `${mediaSetRid}:${mediaItemRid}`;
      
      // Coalesce concurrent requests
      const content = await mediaCoalescer.coalesce(cacheKey, async () => {
        // Check cache
        const cached = await cacheService.getMedia(mediaSetRid, mediaItemRid);
        if (cached) {
          logger.info('Media cache hit', { mediaSetRid, mediaItemRid });
          return cached;
        }
        
        // Fetch from Foundry
        logger.info('Media cache miss, fetching from Foundry', { mediaSetRid, mediaItemRid });
        const mediaContent = await foundryService.getMediaContent(mediaSetRid, mediaItemRid);
        
        // Cache it
        await cacheService.setMedia(mediaSetRid, mediaItemRid, 
          mediaContent.content, mediaContent.contentType);
        
        return mediaContent;
      });
      
      // Set cache headers
      res.set({
        'Content-Type': content.contentType,
        'Cache-Control': 'private, max-age=86400, immutable',
        'ETag': crypto.createHash('md5').update(content.content).digest('hex')
      });
      
      res.send(content.content);
    } catch (error) {
      next(error);
    }
  }
);
```

## 8. Expected Results

### Before Caching
- **Dashboard Load**: 8-10 API calls, 2-3 seconds
- **Profile Photo**: Downloaded 4+ times per session (17MB total)
- **Rate Limiting**: 429 errors after 3-4 page navigations
- **User Experience**: Slow page transitions, loading spinners

### After Caching
- **Dashboard Load**: 1 API call on first load, 0 on subsequent (< 100ms)
- **Profile Photo**: Downloaded once, served from cache (4.3MB total)
- **Rate Limiting**: No 429 errors in normal usage
- **User Experience**: Instant page loads, smooth navigation

### Metrics to Track
```javascript
// Add cache metrics
logger.info('Cache performance', {
  endpoint: req.path,
  cacheHit: true,
  responseTime: Date.now() - startTime,
  apiCallsSaved: 1,
  bytesServedFromCache: content.length
});
```

## 9. Emergency Cache Controls

### Manual Cache Invalidation Endpoint
```javascript
router.post('/cache/invalidate', validateTokenWithScopes(['admin']), async (req, res) => {
  const { type, userId } = req.body;
  
  if (type === 'user') {
    await cacheService.invalidateUser(userId);
  } else if (type === 'all') {
    await redis.flushdb();
  }
  
  res.json({ success: true, message: 'Cache invalidated' });
});
```

### Cache Status Endpoint
```javascript
router.get('/cache/stats', validateTokenWithScopes(['admin']), async (req, res) => {
  const stats = await cacheService.getStats();
  res.json(stats);
});
```

## 8. Configuration

### Environment Variables
```bash
# Cache configuration
DASHBOARD_CACHE_TTL=300 # 5 minutes
MEDIA_CACHE_TTL=86400 # 24 hours
PROFILE_CACHE_TTL=600 # 10 minutes
ENABLE_CACHE_WARMING=true
CACHE_KEY_PREFIX=atlas:v1:
```

## 9. Testing Strategy

1. Unit tests for cache logic
2. Integration tests for cache invalidation
3. Load tests to verify rate limit improvements
4. A/B testing for performance metrics
