
require('dotenv').config();
require('./config/validateEnv')();
const app = require('./app');
const startCronJobs = require('./cron');
const prisma = require('./prisma/client');
const PORT = process.env.PORT || 5000;

async function start() {
  await prisma.$connect();
  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startCronJobs();
  });
  const shutdown = () => {
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
