import dotenv from 'dotenv';
import app from './app.js';
import { initDb } from './database/init.js';

dotenv.config();

(async () => {
  await initDb();
})();

export default app; 
