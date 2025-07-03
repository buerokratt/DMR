import express from 'express';

const host = process.env.HOST ?? 'localhost';
const port = 3002;

const app = express();
let lastReceived: unknown = null;

app.post('/api/messages', (request, response) => {
  lastReceived = request.body;
  console.log('[External B] received:', lastReceived);
  response.sendStatus(200);
});

app.get('/api/messages/last', (_, response) => {
  response.status(200).json(lastReceived || {});
});

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});
