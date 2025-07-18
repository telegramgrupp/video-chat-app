import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { initializeSocket } from './src/socket.js';

// Load environment variables
dotenv.config({ path: '../.env' });

// Log environment variables
console.log('Environment Variables Check:');
console.log('CLIENT_URL:', process.env.CLIENT_URL);
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ Present' : '✗ Missing');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Define allowed origins with regex pattern for development URLs
const allowedOrigins = [
  'http://localhost:5173',
  'https://localhost:5173',
  'http://127.0.0.1:5173',
  'https://127.0.0.1:5173',
  'http://localhost:3000',
  'https://localhost:3000',
  'http://127.0.0.1:3000',
  'https://127.0.0.1:3000',
  process.env.CLIENT_URL,
  // Add WebContainer origin patterns
  /.+\.webcontainer\.io$/,
  /.+\.local-credentialless\.webcontainer-api\.io$/,
  // Add development pattern
  /https?:\/\/localhost(:\d+)?$/,
  // Allow preview URLs
  /.+\.preview\.app\.github\.dev$/,
  /.+\.app\.github\.dev$/
].filter(Boolean);

// Enhanced CORS configuration with specific origins
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      callback(null, true);
      return;
    }

    // Check if the origin matches any allowed origins (including regex patterns)
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return allowedOrigin === origin;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('CORS blocked request from:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400 // 24 hours
};

// Apply CORS middleware before other routes
app.use(cors(corsOptions));
app.use(express.json());

// Add preflight handler for all routes
app.options('*', cors(corsOptions));

// Initialize Socket.IO with CORS settings
const io = initializeSocket(httpServer, {
  ...corsOptions,
  allowRequest: (req, callback) => {
    const origin = req.headers.origin;
    if (!origin) {
      callback(null, true);
      return;
    }

    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return allowedOrigin === origin;
    });

    callback(null, isAllowed);
  }
});

// Enhanced error handling and logging middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server with enhanced error handling
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}).on('error', (error: Error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});