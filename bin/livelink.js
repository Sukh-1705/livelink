#!/usr/bin/env node
const path = require('path');
const { startServer } = require('../server/index');

// Parse simple CLI flags
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    process.env.PORT = args[i + 1];
    i++;
  } else if (args[i] === '--room' && args[i + 1]) {
    process.env.ROOM = args[i + 1];
    i++;
  } else if (args[i] === '--p2p') {
    process.env.MODE = 'p2p';
  } else if (args[i] === '--sfu') {
    process.env.MODE = 'sfu';
  }
}

startServer().catch(err => {
  console.error('Failed to start LiveLink:', err);
  process.exit(1);
});
