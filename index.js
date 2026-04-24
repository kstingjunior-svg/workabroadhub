const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

console.log('Starting server...');
console.log('PORT:', PORT);

app.get('/', (req, res) => {
  console.log('Root route accessed');
  res.json({ message: 'WorkAbroadHub API is running!' });
});

app.get('/health', (req, res) => {
  console.log('Health check accessed');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server successfully started on port ${PORT}`);
});

console.log('Server setup complete');
