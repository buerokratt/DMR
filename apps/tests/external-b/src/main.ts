import { ExternalServiceMessageDto, MessageType } from '@dmr/shared';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { Request, Response } from 'express';
import express from 'express';
import 'reflect-metadata';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8074;
const host = '0.0.0.0';

// Simple message interface for external service
interface SimpleMessage {
  id: string;
  type: MessageType;
  payload: string;
  timestamp: string;
  recipientId: string;
}

let lastReceivedMessage: SimpleMessage | null = null;

const app = express();
app.use(express.json());

// Endpoint to receive messages from DMR Agent B
const handleMessage = (req: Request, res: Response): void => {
  console.log('Received incoming message:', {
    body: req.body as Record<string, unknown>,
    headers: req.headers,
    timestamp: new Date().toISOString(),
  });

  try {
    const dto = plainToInstance(ExternalServiceMessageDto, req.body);
    const errors = validateSync(dto);

    if (errors.length > 0) {
      console.error('Message validation failed:', errors);
      res.status(400).json({ errors });
      return;
    }

    // Convert complex message to simple format
    if (
      dto.id &&
      dto.type &&
      dto.payload?.messages?.[0]?.content &&
      dto.timestamp &&
      dto.recipientId
    ) {
      lastReceivedMessage = {
        id: dto.id,
        type: dto.type,
        payload: dto.payload.messages[0].content,
        timestamp: dto.timestamp,
        recipientId: dto.recipientId,
      };
      console.log('Successfully processed message:', lastReceivedMessage);
      res.status(200).json({ success: true });
    } else {
      console.error('Invalid message format:', dto);
      res.status(400).json({ error: 'Invalid message format' });
    }
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Endpoint to get the last received message
const getLastMessage = (_req: Request, res: Response): void => {
  if (!lastReceivedMessage) {
    res.status(404).json({ error: 'No message received yet' });
    return;
  }
  res.status(200).json(lastReceivedMessage);
};

app.post('/api/messages', handleMessage);
app.get('/api/messages/last', getLastMessage);

app.listen(port, host, () => {
  console.log(`External Service B listening at http://${host}:${port}`);
});
