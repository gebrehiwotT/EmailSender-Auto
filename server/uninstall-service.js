const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
  name: 'EmailSenderApp',
  description: 'BT Email Sender Application Server',
  script: path.join(__dirname, 'index.js')
});

svc.on('uninstall', () => {
  console.log('✅ Service uninstallation complete.');
});

svc.on('error', (err) => {
  console.error('❌ Service error:', err);
});

console.log('Uninstalling EmailSenderApp service...');
svc.uninstall();
