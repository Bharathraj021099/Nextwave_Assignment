require('dotenv').config();

const { loadEnv, env } = require('./config/env');
const { connectWithRetry: connectDB } = require('./config/database');
const { connectWithRetry: connectRedis } = require('./config/redis');
const app = require('./app');

async function start() {
  // Validate required env vars before doing anything else
  loadEnv();

  console.log(`[Server] Starting in ${env.NODE_ENV} mode...`);

  // Wait for backing services to be ready (important in docker compose)
  await connectDB();
  await connectRedis();

  const server = app.listen(env.PORT, () => {
    console.log(`[Server] Listening on port ${env.PORT}`);
  });

  // ─── Graceful shutdown ───────────────────────────────────────────────────
  const shutdown = (signal) => {
    console.log(`\n[Server] ${signal} received — shutting down gracefully`);
    server.close(() => {
      console.log('[Server] HTTP server closed');
      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      console.error('[Server] Forced exit after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled rejection:', reason);
  });
}

start().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
