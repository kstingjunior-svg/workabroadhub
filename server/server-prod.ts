import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';

const app = express();
const PORT = process.env.PORT || 10000;

// Basic middleware
app.use(helmet({
    crossOriginResourcePolicy: false,
}));

app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Basic route
app.get('/', (req, res) => {
    res.json({
        message: 'WorkAbroadHub API is running',
        version: '1.0.0',
        status: 'healthy'
    });
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
