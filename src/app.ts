import express, { type Application } from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import issuesRoutes from './routes/issues.routes.js';
import authorityRoutes from './routes/authority.routes.js';
const app = express();

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/reports', reportsRoutes);
app.use('/issues', issuesRoutes);
app.use('/authority',authorityRoutes)

app.get('/', (req, res) => {
  res.send('Welcome to the Issue Reporting System API');
});
app.get('/health', (req, res) => {
  res.send('OK');
});

export default app;
