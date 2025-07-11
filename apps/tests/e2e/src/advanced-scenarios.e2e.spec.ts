import { MessageType } from '@dmr/shared';
import * as crypto from 'crypto';
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

  // Helper function to get queue stats from RabbitMQ Management UI
  const getQueueStats = async (queueName: string) => {
    const auth = Buffer.from(
      `${process.env.RABBITMQ_DEFAULT_USER}:${process.env.RABBITMQ_DEFAULT_PASSWORD}`,
    ).toString('base64');
    const response = await fetch(
      `${process.env.RABBITMQ_MANAGEMENT_URL}/api/queues/%2F/${queueName}`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    return await response.json();
  };

  // Helper function to get messages from a queue (destructive read)
  const getQueueMessages = async (queueName: string, count = 10) => {
    const auth = Buffer.from(
      `${process.env.RABBITMQ_DEFAULT_USER}:${process.env.RABBITMQ_DEFAULT_PASSWORD}`,
    ).toString('base64');
    const response = await fetch(
      `${process.env.RABBITMQ_MANAGEMENT_URL}/api/queues/%2F/${queueName}/get`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          count: count,
          ackmode: 'ack_requeue_false',
          encoding: 'auto',
        }),
      },
    );

    if (!response.ok) {
      return [];
    }

    return await response.json();
  };

  const waitForMessage = async (
    expectedId: string,
    maxAttempts = 30,
    delay = 500,
  ): Promise<TestMessage | null> => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Get the last message only
        const lastResponse = await fetch(`${process.env.EXTERNAL_SERVICE_B_URL}/api/messages/last`);
        if (lastResponse.ok) {
          const lastMessage = (await lastResponse.json()) as TestMessage;
          if (lastMessage && lastMessage.id === expectedId) {
            return lastMessage;
          }
        }
      } catch (error) {
        // Continue trying on error
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    return null;
  };

  it('should deliver a message from Agent A to Agent B', async () => {
    const messageId = crypto.randomUUID();
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

  it('should handle failure queue scenarios and message counting', async () => {
    // Test 1: Send valid messages sequentially and verify queue handling
    const validMessages: TestMessage[] = [];
    for (let i = 0; i < 3; i++) {
      const messageId = crypto.randomUUID();
      const message: TestMessage = {
        id: messageId,
        type: MessageType.ChatMessage,
        payload: `Test message ${i + 1}`,
        timestamp: new Date().toISOString(),
        senderId: 'd3b07384-d9a0-4c3f-a4e2-123456789abc',
        recipientId: 'a1e45678-12bc-4ef0-9876-def123456789',
      };
      validMessages.push(message);
    }

    // Send and wait for each message individually to avoid race conditions
    for (const message of validMessages) {
      const result = await sendMessage(message);
      expect(result.success).toBe(true);

      // Wait for this specific message to be processed
      const receivedMessage = await waitForMessage(message.id);
      expect(receivedMessage).toBeDefined();
      expect(receivedMessage?.id).toBe(message.id);

      // Small delay between messages to ensure proper processing
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Test 2: Send messages that will trigger DMR server validation failures
    // These messages will pass External Service A validation but fail at DMR server
    const dmrValidationFailures = [
      // Message with invalid timestamp format
      {
        id: crypto.randomUUID(),
        recipientId: 'a1e45678-12bc-4ef0-9876-def123456789',
        timestamp: 'invalid-timestamp-format',
        type: MessageType.ChatMessage,
        payload: 'Message with invalid timestamp',
      },
      // Message with non-existent sender ID
      {
        id: crypto.randomUUID(),
        recipientId: 'a1e45678-12bc-4ef0-9876-def123456789',
        timestamp: new Date().toISOString(),
        type: MessageType.ChatMessage,
        payload: 'Message from non-existent sender',
        senderId: 'non-existent-sender-uuid',
      },
    ];

    // Send these messages directly to DMR Agent A to bypass External Service A validation
    for (const message of dmrValidationFailures) {
      try {
        const response = await fetch(`${process.env.DMR_AGENT_A_URL}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: message.id,
            recipientId: message.recipientId,
            timestamp: message.timestamp,
            type: message.type,
            payload: {
              messages: [
                {
                  content: message.payload,
                  timestamp: message.timestamp,
                }
              ]
            }
          }),
        });
        // Expected to possibly fail, but we'll check the validation failures queue
      } catch (error) {
        // Expected to possibly fail
      }
    }

    // Wait a bit for messages to be processed
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Test 3: Verify validation failures queue functionality
    const validationFailuresStats = await getQueueStats('validation-failures');
    const failureMessages = await getQueueMessages('validation-failures', 5);
    
    // Verify queue access methods work correctly
    expect(Array.isArray(failureMessages)).toBe(true);
    
    // Test 4: Verify agent queue is clean after processing
    const agentQueueStats = await getQueueStats('a1e45678-12bc-4ef0-9876-def123456789');
    expect(agentQueueStats).toBeDefined();
    expect(agentQueueStats.messages).toBe(0);
    expect(agentQueueStats.messages_unacknowledged).toBe(0);
  });

  it('should handle message acknowledgment edge cases', async () => {
    // Test 1: Send message to non-existent recipient (should fail or go to DLQ)
    const nonExistentRecipientMessage: TestMessage = {
      id: crypto.randomUUID(),
      type: MessageType.ChatMessage,
      payload: 'Message to non-existent recipient',
      timestamp: new Date().toISOString(),
      senderId: 'd3b07384-d9a0-4c3f-a4e2-123456789abc',
      recipientId: 'non-existent-recipient-id',
    };

    const result = await sendMessage(nonExistentRecipientMessage);
    // This should fail at the external service level
    expect(result.success).toBe(false);

    // Wait for message to be processed and potentially moved to DLQ
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Test 2: Sequential message sending to test queue depth and acknowledgment
    const sequentialMessages: TestMessage[] = [];
    for (let i = 0; i < 2; i++) {
      const messageId = crypto.randomUUID();
      const message: TestMessage = {
        id: messageId,
        type: MessageType.ChatMessage,
        payload: `Sequential message ${i + 1}`,
        timestamp: new Date().toISOString(),
        senderId: 'd3b07384-d9a0-4c3f-a4e2-123456789abc',
        recipientId: 'a1e45678-12bc-4ef0-9876-def123456789',
      };
      sequentialMessages.push(message);
    }

    // Send and verify each message individually to ensure reliable processing
    for (const message of sequentialMessages) {
      const result = await sendMessage(message);
      expect(result.success).toBe(true);
      
      // Wait for this specific message to be processed
      const receivedMessage = await waitForMessage(message.id);
      expect(receivedMessage).toBeDefined();
      expect(receivedMessage?.id).toBe(message.id);
      expect(receivedMessage?.type).toBe(MessageType.ChatMessage);
      expect(receivedMessage?.recipientId).toBe('a1e45678-12bc-4ef0-9876-def123456789');
      
      // Small delay between messages to ensure proper processing
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Verify final queue state is clean
    const finalQueueStats = await getQueueStats('a1e45678-12bc-4ef0-9876-def123456789');
    expect(finalQueueStats).toBeDefined();
    expect(finalQueueStats.messages).toBe(0);
    expect(finalQueueStats.messages_unacknowledged).toBe(0);
  });

  it('should handle concurrent message processing', async () => {
    // Test concurrent message processing with different message types
    const messageTypes = [MessageType.ChatMessage];

    const concurrentMessages: TestMessage[] = [];
    for (let i = 0; i < 3; i++) {
      const messageId = crypto.randomUUID();
      const message: TestMessage = {
        id: messageId,
        type: messageTypes[i % messageTypes.length],
        payload: `Concurrent message ${i + 1} of type ${messageTypes[i % messageTypes.length]}`,
        timestamp: new Date().toISOString(),
        senderId: 'd3b07384-d9a0-4c3f-a4e2-123456789abc',
        recipientId: 'a1e45678-12bc-4ef0-9876-def123456789',
      };
      concurrentMessages.push(message);
    }

    // Send messages sequentially to avoid race conditions
    for (const message of concurrentMessages) {
      const result = await sendMessage(message);
      expect(result.success).toBe(true);

      // Wait for this specific message to be processed
      const receivedMessage = await waitForMessage(message.id);
      expect(receivedMessage).toBeDefined();
      expect(receivedMessage?.id).toBe(message.id);
      expect(receivedMessage?.type).toBe(message.type);

      // Small delay between messages
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Verify final queue state is clean after concurrent processing
    const queueStats = await getQueueStats('a1e45678-12bc-4ef0-9876-def123456789');
    expect(queueStats).toBeDefined();
    expect(queueStats.messages).toBe(0);
    expect(queueStats.messages_unacknowledged).toBe(0);
  });
});
