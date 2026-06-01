const { getRedisClient } = require('../config/redis');
const { env } = require('../config/env');

/**
 * Cache Strategy: Per-assignee task list caching
 *
 * Why per-assignee?
 *   The spec calls out "Redis caching on task list per assignee". Scoping
 *   cache keys to the assignee lets us do targeted invalidation — when a task
 *   changes we only bust the cache for the affected user(s), not the entire
 *   result set.
 *
 * Key format:
 *   tasks:org:{orgId}:assignee:{assigneeId}:{queryFingerprint}
 *   tasks:org:{orgId}:all:{queryFingerprint}    ← unfiltered lists
 *
 * Invalidation:
 *   When a task is created, updated, or deleted we call invalidateForAssignee()
 *   with both the OLD and NEW assignee IDs (they may differ on reassignment).
 *   This uses SCAN + DEL to remove all matching keys without blocking Redis.
 *
 * TTL: 5 minutes (configurable via CACHE_TTL_SECONDS env var)
 */

const PREFIX = 'tasks';

/**
 * Build a deterministic cache key from query parameters.
 */
function buildKey(orgId, assigneeId, query) {
  const scope = assigneeId ? `assignee:${assigneeId}` : 'all';
  const fingerprint = JSON.stringify(query, Object.keys(query).sort());
  return `${PREFIX}:org:${orgId}:${scope}:${fingerprint}`;
}

async function getCache(key) {
  try {
    const redis = getRedisClient();
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // degrade gracefully on Redis failure
  }
}

async function setCache(key, value) {
  try {
    const redis = getRedisClient();
    await redis.setex(key, env.CACHE_TTL_SECONDS, JSON.stringify(value));
  } catch {
    // non-fatal
  }
}

/**
 * Delete all task-list cache keys for a given org + optional assigneeId.
 * Uses SCAN to avoid KEYS blocking Redis in production.
 */
async function invalidateForAssignee(orgId, assigneeId) {
  try {
    const redis = getRedisClient();
    const pattern = assigneeId
      ? `${PREFIX}:org:${orgId}:assignee:${assigneeId}:*`
      : `${PREFIX}:org:${orgId}:all:*`;

    await scanAndDelete(redis, pattern);
  } catch (err) {
    console.error('[Cache] Invalidation failed:', err.message);
  }
}

/**
 * When a task's assignee changes, bust both the old and new assignee caches,
 * plus the org-wide "all" cache.
 */
async function invalidateOnTaskMutation(orgId, prevAssigneeId, newAssigneeId) {
  const promises = [
    invalidateForAssignee(orgId, null), // "all" lists
  ];
  if (prevAssigneeId) promises.push(invalidateForAssignee(orgId, prevAssigneeId));
  if (newAssigneeId && newAssigneeId !== prevAssigneeId) {
    promises.push(invalidateForAssignee(orgId, newAssigneeId));
  }
  await Promise.all(promises);
}

/**
 * Iteratively SCAN and delete keys matching pattern.
 */
async function scanAndDelete(redis, pattern) {
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== '0');
}

module.exports = { buildKey, getCache, setCache, invalidateForAssignee, invalidateOnTaskMutation };
