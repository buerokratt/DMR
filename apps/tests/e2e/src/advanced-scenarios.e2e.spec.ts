import { MessageType } from '@dmr/shared';
import { v4 as uuidv4 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { waitForHealthyServices } from './helpers/health-check.helper';

// Simple message structure for testing
interface TestMessage {
  id: string;
  type: MessageType;
  payload: string;
  timestamp: string;
  senderId: string;
  recipientId: string;
}

describe('DMR Basic Message Flow E2E Test', () => {
  beforeAll(async () => {
    console.log('Waiting for services to be ready...');
    await waitForHealthyServices();
    console.log('All services are ready');
  });

  afterAll(async () => {
    // Clear messages
    await fetch(`${process.env.EXTERNAL_SERVICE_B_URL}/api/messages`, { method: 'DELETE' });
  });

  const sendMessage = async (
    message: TestMessage,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${process.env.EXTERNAL_SERVICE_A_URL}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  };

  const waitForMessage = async (
    expectedId: string,
    maxAttempts = 60,
    delay = 500,
  ): Promise<TestMessage | null> => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await fetch(`${process.env.EXTERNAL_SERVICE_B_URL}/api/messages/last`);
      const message = (await response.json()) as TestMessage;

      if (message && message.id === expectedId) {
        return message;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    return null;
  };

  it('should deliver a message from Agent A to Agent B', async () => {
    const messageId = uuidv4();
    const message: TestMessage = {
      id: messageId,
      type: MessageType.ChatMessage,
      payload: 'Hello from Agent A!',
      timestamp: new Date().toISOString(),
      senderId: 'd3b07384-d9a0-4c3f-a4e2-123456789abc',
      recipientId: 'a1e45678-12bc-4ef0-9876-def123456789',
    };

    const result = await sendMessage(message);
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(result.error);
    }

    const receivedMessage = await waitForMessage(messageId);
    expect(receivedMessage).toBeDefined();
    expect(receivedMessage?.id).toBe(messageId);
    expect(receivedMessage?.type).toBe(MessageType.ChatMessage);
    expect(receivedMessage?.payload).toBe('Hello from Agent A!');
    expect(receivedMessage?.recipientId).toBe('a1e45678-12bc-4ef0-9876-def123456789');
  });
});
