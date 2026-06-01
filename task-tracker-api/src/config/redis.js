const Redis = require('ioredis');
const { env } = require('./env');

let client;

function getRedisClient() {
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    client.on('connect', () => console.log('[Redis] Connected successfully'));
    client.on('error', (err) => console.error('[Redis] Error:', err.message));
    client.on('reconnecting', () => console.warn('[Redis] Reconnecting...'));
  }
  return client;
}

async function connectWithRetry(retries = 10, delayMs = 2000) {
  const redis = getRedisClient();
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await redis.ping();
      return;
    } catch (err) {
      console.warn(`[Redis] Connection attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
}

module.exports = { getRedisClient, connectWithRetry };
