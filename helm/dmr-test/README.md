### Info

Current images are built from a personal Github fork

Inside `values.yaml` give the info about private and public keys.

To Generate them for testing use following for both `clientA` and `clientB`:

Generate private key:

`openssl genpkey -algorithm RSA -out agentA.key -pkeyopt rsa_keygen_bits:2048`

Extract the public key:

`openssl pkey -in agentA.key -pubout -out agentA.pub`


Running deployment:

`helm install -n <namespace> <releasename> <chart path>`


Testing:

Run commands as followed:

`kubectl create configmap test-server-script --from-file=test-server.js`

`kubectl apply -f test-server.yaml`

To test:

```
curl -v -X POST http://dmr-agent-b:8077/v1/messages -H "Content-Type: application/json" -d '{"id":"3d6f0a45-3a24-4e54-90e6-d701748f0851","recipientId":"89b34e85-46af-4628-b193-7f6efadf0f26","timestamp":"2024-01-15T10:30:00.000Z","type":"ChatMessage","payload":{"chat":{"id":"f47ac10b-58cc-4372-a567-0e02b2c3d479","created":"2024-01-15T10:00:00.000Z"},"messages":[{"id":"550e8400-e29b-41d4-a716-446655440000","chatId":"f47ac10b-58cc-4372-a567-0e02b2c3d479","content":"example string 2","authorTimestamp":"2024-01-15T10:30:00.000Z","authorRole":"end-user"}]}}'
```

Replace `id` and `recipientId` if needed
