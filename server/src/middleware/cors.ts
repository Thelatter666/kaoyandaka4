import cors from 'cors';

export const corsMiddleware = cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
});
