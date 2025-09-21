import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import session from 'express-session';
import jiraRouter from './routes/jira';
import { generateRouter } from './routes/generate';

// Load env from project root and backend root (either is fine)
const rootDotenv = path.resolve(process.cwd(), '.env');
const backendDotenv = path.resolve(__dirname, '../.env');
dotenv.config({ path: rootDotenv });
dotenv.config({ path: backendDotenv });

const app = express();

// CORS: allow frontend (change if you use a different origin)
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const allowedOrigins = [
  CORS_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
    return callback(new Error(msg), false);
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // set true only behind HTTPS + trust proxy
}));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/jira', jiraRouter);
app.use('/api/generate-tests', generateRouter);

const PORT = Number(process.env.PORT || 8080);
// Bind to 127.0.0.1 to avoid weird IPv6 localhost issues
const HOST = process.env.HOST || '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`✅ Backend listening on http://${HOST}:${PORT}`);
  console.log(`   CORS_ORIGIN = ${CORS_ORIGIN}`);
});
