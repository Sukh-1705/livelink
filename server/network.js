const os = require('os');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');

function getPrimaryLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Skip virtual or APIPA interfaces
        if (!iface.address.startsWith('169.254.') && !iface.address.startsWith('127.')) {
          return iface.address;
        }
      }
    }
  }
  return '127.0.0.1';
}

function getAllLanIps() {
  const interfaces = os.networkInterfaces();
  const list = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        list.push({ name, address: iface.address });
      }
    }
  }
  return list;
}

function printServerBanner(port, defaultRoom = 'studio') {
  const primaryIp = getPrimaryLanIp();
  const lanUrl = `https://${primaryIp}:${port}`;
  const localUrl = `https://localhost:${port}`;
  const senderUrl = `${lanUrl}/sender?room=${defaultRoom}`;
  const receiverUrl = `${localUrl}/receiver?room=${defaultRoom}`;

  console.log('\n' + '='.repeat(64));
  console.log('   🎥  LIVELINK — ULTRA-LOW-LATENCY MULTI-CAMERA LAN STUDIO');
  console.log('='.repeat(64));
  console.log(`\n  Local Production Room:`);
  console.log(`  ► Receiver / Multiview: \x1b[36m${receiverUrl}\x1b[0m`);
  console.log(`  ► Local Web Portal:     \x1b[36m${localUrl}\x1b[0m\n`);
  console.log(`  Camera Laptops on LAN / Wi-Fi:`);
  console.log(`  ► Sender Direct Link:   \x1b[32m${senderUrl}\x1b[0m\n`);
  console.log(`  Scan to connect camera laptop / phone to Studio:`);

  try {
    qrcodeTerminal.generate(senderUrl, { small: true });
  } catch (err) {
    // fallback if terminal doesn't support small
  }

  console.log('='.repeat(64));
  console.log('  [Tip] Browser SSL warning: click "Advanced" -> "Proceed to site"');
  console.log('  [Mode] Hardware acceleration prioritized | Bandwidth uncapped\n');
}

async function getQrDataUri(url) {
  try {
    return await QRCode.toDataURL(url, { width: 260, margin: 1 });
  } catch (e) {
    return null;
  }
}

module.exports = {
  getPrimaryLanIp,
  getAllLanIps,
  printServerBanner,
  getQrDataUri
};
