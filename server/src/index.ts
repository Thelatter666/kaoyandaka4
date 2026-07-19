import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import presetsRouter from './routes/presets.js';
import tasksRouter from './routes/tasks.js';
import reviewsRouter from './routes/reviews.js';
import focusRouter from './routes/focus.js';
import coursesRouter from './routes/courses.js';
import statisticsRouter from './routes/statistics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = parseInt(process.env.SERVER_PORT || '3001', 10);

app.use(corsMiddleware);
app.use(express.json());

// API Routes
app.use('/api/v1/presets', presetsRouter);
app.use('/api/v1/tasks', tasksRouter);
app.use('/api/v1/reviews', reviewsRouter);
app.use('/api/v1/focus', focusRouter);
app.use('/api/v1/courses', coursesRouter);
app.use('/api/v1/statistics', statisticsRouter);

// Health check
app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('API routes:');
  console.log('  GET  /api/v1/health');
  console.log('  /api/v1/presets');
  console.log('  /api/v1/tasks');
  console.log('  /api/v1/reviews');
  console.log('  /api/v1/focus');
  console.log('  /api/v1/courses');
  console.log('  /api/v1/statistics');
});

export default app;
