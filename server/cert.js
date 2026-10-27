const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');
const os = require('os');

function getLanIps() {
  const interfaces = os.networkInterfaces();
  const ips = ['127.0.0.1', 'localhost'];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return [...new Set(ips)];
}

async function getOrGenerateCert(certDir = path.join(__dirname, '..', '.certs')) {
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const key = fs.readFileSync(keyPath, 'utf8');
    const cert = fs.readFileSync(certPath, 'utf8');
    return { key, cert, isNew: false };
  }

  const lanIps = getLanIps();
  const altNames = [
    { type: 2, value: 'localhost' },
    ...lanIps.filter(ip => ip !== 'localhost').map(ip => ({ type: 7, ip: ip }))
  ];

  const attrs = [
    { name: 'commonName', value: 'LiveLink LAN Studio' },
    { name: 'organizationName', value: 'LiveLink Production' },
    { name: 'countryName', value: 'US' }
  ];

  const pems = await selfsigned.generate(attrs, {
    keySize: 2048,
    days: 365,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: true },
      {
        name: 'keyUsage',
        keyCertSign: true,
        digitalSignature: true,
        keyEncipherment: true,
        dataEncipherment: true
      },
      {
        name: 'subjectAltName',
        altNames: altNames
      }
    ]
  });

  fs.writeFileSync(keyPath, pems.private, 'utf8');
  fs.writeFileSync(certPath, pems.cert, 'utf8');

  return { key: pems.private, cert: pems.cert, isNew: true };
}

module.exports = {
  getOrGenerateCert,
  getLanIps
};
