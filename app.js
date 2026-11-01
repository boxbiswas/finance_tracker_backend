import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve directory to ensure backend/.env loads reliably regardless of launch directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import mongoose from 'mongoose';
import connectDB from './config/config.js';
import authRoutes from './routes/authRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import budgetRoutes from './routes/budgetRoutes.js';
import exportRoutes from './routes/exportRoutes.js';
import copilotRoutes from './routes/copilotRoutes.js';
import errorHandler from './middlewares/errorHandler.js';
import notFoundHandler from './middlewares/notFoundHandler.js';

const app = express();

// Connect to MongoDB
connectDB();

// CORS configuration (supports credentials for httpOnly cookies)
app.use(cors({
    origin: 'http://localhost:5173' || process.env.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body Parsing & Cookie Parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Health Check Endpoint (GET /health)
app.get('/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    const dbStatusMap = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };

    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: `${Math.floor(process.uptime())}s`,
        database: dbStatusMap[dbState] || 'unknown'
    });
});

// Authentication Routes (POST /auth/register, POST /auth/login, POST /auth/logout)
app.use('/auth', authRoutes);

// Transaction Routes (POST /transactions, GET /transactions, DELETE /transactions/:id)
app.use('/transactions', transactionRoutes);

// Analytics Routes (GET /analytics/summary, GET /analytics/category-breakdown, GET /analytics/monthly-trends)
app.use('/analytics', analyticsRoutes);

// Budget Routes (GET /budgets, POST /budgets, PATCH /budgets/:id, DELETE /budgets/:id)
app.use('/budgets', budgetRoutes);

// Export Routes (GET /exports/transactions?format=csv|pdf)
app.use('/exports', exportRoutes);

// Copilot Financial Context Routes (GET/POST /copilot/context/...)
app.use('/copilot', copilotRoutes);

// 404 Handler for undefined routes
app.use(notFoundHandler);

// Centralized Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Graceful Shutdown on SIGINT and SIGTERM
const gracefulShutdown = async (signal) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    server.close(async () => {
        console.log('HTTP server closed.');
        try {
            await mongoose.connection.close();
            console.log('MongoDB connection closed.');
            process.exit(0);
        } catch (err) {
            console.error('Error closing MongoDB connection:', err);
            process.exit(1);
        }
    });
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export default app;