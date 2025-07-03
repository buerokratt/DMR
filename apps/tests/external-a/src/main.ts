import express from 'express';
import { randomUUID } from 'node:crypto';
import axios from 'axios';

const host = process.env.HOST ?? 'localhost';
const port = 3001;

const app = express();
app.use(express.json());

app.post('/api/messages', async (_, response): Promise<void> => {
  const message = {
    id: randomUUID(),
    recipientId: 'a1e45678-12bc-4ef0-9876-def123456789',
    payload: { hello: 'from agent A' },
  };

  try {
    await axios.post('http://dmr-agent-a:5001/v1/messages', message);
    response.status(200).json({ sent: true, message });
  } catch (error: unknown) {
    console.error(error);
    response.status(500).json({ error: 'Failed to send message', details: error });
  }
});

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});
