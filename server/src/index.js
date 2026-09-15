require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./db');
const apiRoutes = require('./routes');

const PORT = process.env.PORT || 4000;

async function main() {
  await connectDB();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (req, res) => res.json({ ok: true }));
  app.use('/api', apiRoutes);

  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
    console.log('From a physical device on Expo Go, use your machine\'s LAN IP instead of localhost.');
  });
}

main().catch((e) => {
  console.error('Failed to start server:', e.message);
  process.exit(1);
});
