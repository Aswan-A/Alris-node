import dotenv from 'dotenv';
import app from './app.js';
import { initDb } from './database/init.js';

dotenv.config();

const PORT = process.env.PORT || 4000;

(async () => {
  await initDb();
  app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
})();
