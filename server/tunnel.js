const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class TunnelManager {
  constructor() {
    this.publicUrl = null;
    this.process = null;
    this.binPath = path.join(__dirname, '..', 'node_modules', 'cloudflared', 'bin', 'cloudflared.exe');
  }

  async start(localPort = 8080) {
    if (this.publicUrl) return this.publicUrl;

    if (!fs.existsSync(this.binPath)) {
      console.log('[Tunnel] cloudflared binary not found, skipping public tunnel.');
      return null;
    }

    console.log(`[Tunnel] Launching Cloudflare Public Tunnel for port ${localPort}...`);

    return new Promise((resolve) => {
      this.process = spawn(this.binPath, [
        'tunnel',
        '--protocol', 'http2',
        '--url', `http://localhost:${localPort}`
      ], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let resolved = false;

      const checkOutput = (data) => {
        const text = data.toString();
        const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match && !resolved) {
          this.publicUrl = match[0];
          resolved = true;
          console.log('\n' + '='.repeat(64));
          console.log(`  🌍 PUBLIC WORLDWIDE BROADCAST URL:`);
          console.log(`  \x1b[32m${this.publicUrl}\x1b[0m`);
          console.log('  Share this link with any computer in the world!');
          console.log('='.repeat(64) + '\n');
          resolve(this.publicUrl);
        }
      };

      this.process.stdout.on('data', checkOutput);
      this.process.stderr.on('data', checkOutput);

      this.process.on('error', (err) => {
        console.warn('[Tunnel Error]:', err.message);
        if (!resolved) resolve(null);
      });

      // 15-second timeout fallback
      setTimeout(() => {
        if (!resolved) {
          console.warn('[Tunnel] Timed out waiting for Cloudflare URL.');
          resolve(null);
        }
      }, 15000);
    });
  }

  stop() {
    if (this.process) {
      try {
        this.process.kill();
      } catch (e) {}
      this.process = null;
      this.publicUrl = null;
    }
  }
}

const instance = new TunnelManager();
module.exports = instance;
