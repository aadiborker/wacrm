const path = require('path');

const appDir = process.env.APP_DIR || path.join(process.env.HOME || '/home/ubuntu', 'wacrm');
const standaloneDir = path.join(appDir, '.next/standalone');

module.exports = {
  apps: [
    {
      name: process.env.PM2_NAME || 'wacrm',
      script: path.join(standaloneDir, 'server.js'),
      cwd: standaloneDir,
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '3000',
        HOSTNAME: process.env.HOSTNAME || '0.0.0.0',
        KEEP_ALIVE_TIMEOUT: process.env.KEEP_ALIVE_TIMEOUT || '180000',
      },
    },
  ],
};
