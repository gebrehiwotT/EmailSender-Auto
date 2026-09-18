const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
  name: 'EmailSenderApp',
  description: 'BT Email Sender Application Server',
  script: path.join(__dirname, 'index.js'),
  nodeOptions: [],
  env: [
    { name: 'NODE_ENV', value: 'production' }
  ]
});

svc.on('install', () => {
  console.log('✅ Service installed successfully!');
  console.log('Starting service...');
  svc.start();
});

svc.on('start', () => {
  console.log('✅ EmailSenderApp service started!');
  console.log('👉 Open your browser at: http://localhost:8085');
});

svc.on('error', (err) => {
  console.error('❌ Service error:', err);
});

svc.on('alreadyinstalled', () => {
  console.log('ℹ️  Service is already installed. Starting it...');
  svc.start();
});

console.log('Installing EmailSenderApp as a Windows Service...');
svc.install();
