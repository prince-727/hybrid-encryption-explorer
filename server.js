// ============================================
// HYBRID ENCRYPTION BACKEND SERVER
// Express.js + CORS for one-time links
// ============================================

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// In-memory storage for secrets (expires after TTL)
const secrets = new Map();

// ============================================
// API ENDPOINTS
// ============================================

/**
 * POST /api/secret
 * Create a one-time secret link
 * 
 * Request body:
 * {
 *   encryptedPackage: { ... },
 *   ttlMinutes: 60
 * }
 * 
 * Response:
 * {
 *   id: "abc123def456...",
 *   url: "http://localhost:3000/api/secret/abc123def456..."
 * }
 */
app.post('/api/secret', (req, res) => {
    try {
        const { encryptedPackage, ttlMinutes } = req.body;

        // Validation
        if (!encryptedPackage) {
            return res.status(400).json({ 
                error: 'Missing encryptedPackage in request body' 
            });
        }

        if (!encryptedPackage.encryptedSymmetricKey || 
            !encryptedPackage.iv || 
            !encryptedPackage.ciphertext) {
            return res.status(400).json({ 
                error: 'Invalid encryptedPackage format: missing required fields' 
            });
        }

        const ttl = (ttlMinutes || 60) * 60 * 1000; // Convert to milliseconds
        const id = generateSecureId();
        const expiresAt = Date.now() + ttl;

        // Store the secret
        secrets.set(id, {
            encryptedSymmetricKey: encryptedPackage.encryptedSymmetricKey,
            iv: encryptedPackage.iv,
            ciphertext: encryptedPackage.ciphertext,
            algorithm: encryptedPackage.algorithm || 'AES-256-GCM with RSA-2048-OAEP',
            timestamp: encryptedPackage.timestamp,
            expiresAt: expiresAt,
            accessed: false
        });

        // Auto-delete after TTL
        setTimeout(() => {
            secrets.delete(id);
            console.log(`[AUTO-DELETE] Secret ${id} expired and deleted`);
        }, ttl);

        const url = `http://localhost:3000/api/secret/${id}`;

        console.log(`[CREATE] Secret created: ${id}`);
        console.log(`[TTL] Expires in ${ttlMinutes} minutes`);

        return res.json({
            success: true,
            id: id,
            url: url,
            expiresAt: new Date(expiresAt).toISOString()
        });

    } catch (error) {
        console.error('[ERROR] POST /api/secret:', error);
        return res.status(500).json({ 
            error: 'Server error: ' + error.message 
        });
    }
});

/**
 * GET /api/secret/:id
 * Retrieve a one-time secret (can only be accessed once)
 * 
 * Response:
 * {
 *   encryptedSymmetricKey: "...",
 *   iv: "...",
 *   ciphertext: "...",
 *   algorithm: "..."
 * }
 */
app.get('/api/secret/:id', (req, res) => {
    try {
        const { id } = req.params;

        // Check if secret exists
        if (!secrets.has(id)) {
            console.log(`[ERROR] Secret not found or already accessed: ${id}`);
            return res.status(404).json({ 
                error: 'Secret not found. It may have already been accessed or expired.' 
            });
        }

        const secret = secrets.get(id);

        // Check if expired
        if (Date.now() > secret.expiresAt) {
            secrets.delete(id);
            console.log(`[EXPIRED] Secret accessed after expiration: ${id}`);
            return res.status(410).json({ 
                error: 'Secret has expired. Please request a new one.' 
            });
        }

        // Check if already accessed (one-time use)
        if (secret.accessed) {
            console.log(`[ERROR] Secret already accessed: ${id}`);
            return res.status(410).json({ 
                error: 'This secret has already been accessed. One-time links can only be used once.' 
            });
        }

        // Mark as accessed and delete
        secret.accessed = true;
        const response = {
            encryptedSymmetricKey: secret.encryptedSymmetricKey,
            iv: secret.iv,
            ciphertext: secret.ciphertext,
            algorithm: secret.algorithm,
            timestamp: secret.timestamp
        };

        // Delete immediately (one-time use)
        secrets.delete(id);

        console.log(`[ACCESSED] Secret accessed and deleted: ${id}`);

        return res.json(response);

    } catch (error) {
        console.error('[ERROR] GET /api/secret/:id:', error);
        return res.status(500).json({ 
            error: 'Server error: ' + error.message 
        });
    }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    return res.json({ 
        status: 'ok', 
        message: 'Hybrid Encryption Backend is running',
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /
 * Serve index.html
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
    console.log(`[404] Not found: ${req.method} ${req.path}`);
    res.status(404).json({ 
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
    });
});

// General error handler
app.use((err, req, res, next) => {
    console.error('[UNHANDLED ERROR]:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: err.message
    });
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate a secure random ID for secrets
 */
function generateSecureId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 32; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

/**
 * Print startup banner
 */
function printBanner() {
    console.log('');
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║   Hybrid Encryption Backend Server             ║');
    console.log('║   Running on http://localhost:' + PORT + '             ║');
    console.log('║   Press Ctrl+C to stop                         ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log('');
    console.log('Available endpoints:');
    console.log('  POST   /api/secret       - Create one-time link');
    console.log('  GET    /api/secret/:id   - Access one-time link');
    console.log('  GET    /api/health       - Health check');
    console.log('');
}

// ============================================
// START SERVER
// ============================================

const server = app.listen(PORT, () => {
    printBanner();
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Received SIGINT, shutting down gracefully...');
    server.close(() => {
        console.log('[SHUTDOWN] Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n[SHUTDOWN] Received SIGTERM, shutting down gracefully...');
    server.close(() => {
        console.log('[SHUTDOWN] Server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
