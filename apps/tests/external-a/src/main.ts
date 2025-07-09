import { ExternalServiceMessageDto, MessageType } from '@dmr/shared';
import axios from 'axios';
import type { Request, Response } from 'express';
import express from 'express';
import { randomUUID } from 'node:crypto';
import 'reflect-metadata';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8074;
const host = '0.0.0.0';
const dmrAgentAUrl = process.env.DMR_AGENT_A_URL ?? 'http://dmr-agent-a:8077';

const app = express();

app.use(express.json());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Simple message interface for external service
interface SimpleMessage {
  id?: string;
  recipientId: string;
  timestamp?: string;
  type: MessageType;
  payload: string | Record<string, unknown>;
}

// Store sent messages for verification
const sentMessages: SimpleMessage[] = [];
const receivedMessages: SimpleMessage[] = [];

// Endpoint to receive messages from e2e tests and forward to DMR Agent A
app.post('/api/messages', async (request: Request, response: Response): Promise<void> => {
  try {
    const incomingMessage = request.body as SimpleMessage;
    console.log('[External A] Received message from e2e test:', incomingMessage);

    // Convert to ExternalServiceMessageDto format
    const chatId = randomUUID();
    const messageId = randomUUID();
    const timestamp = new Date().toISOString();
    const dmrMessage: ExternalServiceMessageDto = {
      id: incomingMessage.id || randomUUID(),
      recipientId: incomingMessage.recipientId,
      timestamp: incomingMessage.timestamp || timestamp,
      type: MessageType.ChatMessage,
      payload: {
        chat: {
          id: chatId,
          endUserFirstName: 'Test',
          endUserLastName: 'User',
          endUserId: 'test-user-123',
          endUserEmail: 'test@example.com',
          customerSupportDisplayName: 'E2E Test Support',
          created: timestamp,
          endUserOs: 'Test OS',
          endUserUrl: 'https://test.example.com',
        },
        messages: [
          {
            id: messageId,
            chatId: chatId,
            content:
              typeof incomingMessage.payload === 'string'
                ? incomingMessage.payload
                : JSON.stringify(incomingMessage.payload),
            authorTimestamp: timestamp,
            authorFirstName: 'Test',
            authorLastName: 'User',
            authorRole: 'EndUser',
            created: timestamp,
            preview: 'E2E Test Message',
          },
        ],
      },
    };

    console.log('[External A] Sending to DMR Agent A:', JSON.stringify(dmrMessage, null, 2));

    // Send to DMR Agent A
    await axios.post(`${dmrAgentAUrl}/v1/messages`, dmrMessage);
    sentMessages.push(incomingMessage);
    response.status(200).json({ success: true });
  } catch (error) {
    console.error('[External A] Error:', error);
    response.status(500).json({ error: 'Failed to process message' });
  }
});

// Endpoint to receive messages from DMR Agent A (incoming messages)
app.post('/api/messages/incoming', (request, response) => {
  const message = request.body;
  console.log('[External A] Received incoming message from DMR Agent A:', message);

  receivedMessages.push({
    ...message,
    receivedAt: new Date().toISOString(),
  });

  response.status(200).json({ success: true });
});

// Endpoint to get sent messages (for e2e test verification)
app.get('/api/messages/sent', (_, response) => {
  response.status(200).json(sentMessages);
});

// Endpoint to get received messages (for e2e test verification)
app.get('/api/messages/received', (_, response) => {
  response.status(200).json(receivedMessages);
});

// Health check
app.get('/health', (_, response) => {
  response.status(200).json({ status: 'healthy', service: 'external-service-a' });
});

app.listen(port, host, () => {
  console.log(`[External Service A] ready at http://${host}:${port}`);
});
