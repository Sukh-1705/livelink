const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { getOrGenerateCert, getLanIps } = require('./cert');
const { getPrimaryLanIp, printServerBanner, getQrDataUri } = require('./network');
const mediasoupManager = require('./mediasoupManager');
const SignalingServer = require('./signaling');
const tunnelManager = require('./tunnel');

const IS_CLOUD = !!(process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.KOYEB || process.env.FLY_APP_NAME || (process.env.NODE_ENV === 'production' && process.env.PORT && !process.env.LOCAL_SSL));
const PORT = parseInt(process.env.PORT || '4443', 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '8080', 10);
const DEFAULT_ROOM = process.env.ROOM || 'studio';
const ENABLE_TUNNEL = !IS_CLOUD && process.env.TUNNEL !== 'false'; // Only run Quick Tunnel in local dev

async function startServer() {
  const app = express();
  app.use(express.json());

  // Cross-Origin headers for high performance WebRTC & WebCodecs / SharedArrayBuffer
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  // Serve static dist build if exists
  const distPath = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
  }

  // TLS Certificate (used in local mode)
  const { key, cert } = await getOrGenerateCert();
  const primaryIp = getPrimaryLanIp();

  // API Endpoints
  let signalingServer = null;

  app.get('/api/info', async (req, res) => {
    const host = req.get('host');
    const proto = (req.protocol === 'https' || req.get('x-forwarded-proto') === 'https') ? 'https' : 'http';
    const detectedUrl = `${proto}://${host}`;
    const lanUrl = `https://${primaryIp}:${PORT}`;
    const publicUrl = IS_CLOUD ? detectedUrl : (tunnelManager.publicUrl || detectedUrl);
    const shareUrl = publicUrl || lanUrl;
    const qrDataUri = await getQrDataUri(`${shareUrl}/sender?room=${DEFAULT_ROOM}`);
    const stats = signalingServer ? signalingServer.getStats() : {};

    res.json({
      name: 'LiveLink LAN Studio',
      version: '1.0.0',
      port: PORT,
      httpPort: HTTP_PORT,
      primaryIp,
      lanIps: getLanIps(),
      lanUrl,
      publicUrl,
      shareUrl,
      defaultRoom: DEFAULT_ROOM,
      qrDataUri,
      stats
    });
  });

  app.get('/api/cert', (req, res) => {
    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    res.setHeader('Content-Disposition', 'attachment; filename="livelink-lan-cert.pem"');
    res.send(cert);
  });

  // Client-side routes (SPA fallback)
  app.use((req, res, next) => {
    // If it's an API route or file that wasn't found, let it 404
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      return next();
    }
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>LiveLink Server Starting</title></head>
        <body style="background:#09090b;color:#f4f4f5;font-family:sans-serif;padding:40px;text-align:center;">
          <h1>LiveLink Server Active</h1>
          <p>Frontend building or running on Vite development server.</p>
          <p>LAN IP: <strong>${primaryIp}:${PORT}</strong></p>
        </body>
        </html>
      `);
    }
  });

  // Initialize Mediasoup
  await mediasoupManager.init();

  // In Cloud environments (Render, Railway, Koyeb), the platform provides SSL on edge
  if (IS_CLOUD) {
    const cloudPort = parseInt(process.env.PORT || '8080', 10);
    const server = http.createServer(app);
    signalingServer = new SignalingServer(server);
    server.listen(cloudPort, '0.0.0.0', () => {
      console.log(`\n================================================================`);
      console.log(`  🚀 LIVELINK CLOUD DEPLOYMENT ACTIVE`);
      console.log(`  Listening on port ${cloudPort}`);
      console.log(`================================================================\n`);
    });
    return { server, signalingServer, app };
  }

  // Create HTTPS Server (Local LAN mode)
  const httpsServer = https.createServer({ key, cert }, app);
  signalingServer = new SignalingServer(httpsServer);

  httpsServer.listen(PORT, '0.0.0.0', () => {
    printServerBanner(PORT, DEFAULT_ROOM);
  });

  // Create HTTP Server (Zero-warning access for localhost and LAN testing)
  try {
    const httpServer = http.createServer(app);
    // Attach WebSocket server to HTTP server as well
    httpServer.on('upgrade', (request, socket, head) => {
      if (request.url.startsWith('/ws')) {
        signalingServer.wss.handleUpgrade(request, socket, head, (ws) => {
          signalingServer.wss.emit('connection', ws, request);
        });
      }
    });

    httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
      console.log(`  ► Local Zero-SSL Port:  \x1b[36mhttp://localhost:${HTTP_PORT}\x1b[0m\n`);
    });

    // Start Public Tunnel (Cloudflare Quick Tunnel)
    if (ENABLE_TUNNEL) {
      tunnelManager.start(HTTP_PORT).catch(err => {
        console.warn('[Tunnel] Could not initialize public tunnel:', err.message);
      });
    }
  } catch (err) {
    console.warn('Could not bind HTTP port 8080:', err.message);
  }

  process.on('SIGINT', () => {
    tunnelManager.stop();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    tunnelManager.stop();
    process.exit(0);
  });

  return { httpsServer, signalingServer, app };
}

if (require.main === module) {
  startServer().catch(err => {
    console.error('Fatal server error:', err);
    process.exit(1);
  });
}

module.exports = { startServer };
