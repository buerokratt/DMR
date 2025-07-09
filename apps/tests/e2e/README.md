# DMR End-to-End Tests

This directory contains comprehensive end-to-end tests for the DMR (Distributed Message Rooms) system. These tests verify the complete message flow from external services through DMR agents, DMR servers, and RabbitMQ.

## Test Architecture

The e2e tests simulate the complete DMR ecosystem:

```
External Service A → DMR Agent A → DMR Server → RabbitMQ → DMR Server → DMR Agent B → External Service B
```

## Test Scenarios

### ✅ Basic Message Flow

- **Full message delivery**: Tests complete message flow from External Service A to External Service B
- **Multiple messages**: Verifies sequential message handling
- **Message integrity**: Ensures payload encryption/decryption works correctly

### ✅ Health Checks

- **Service availability**: Verifies all services are healthy and responsive
- **Connection status**: Checks WebSocket connections between agents and servers

### ✅ Error Scenarios

- **Invalid recipients**: Tests handling of messages to non-existent agents
- **Connection failures**: Simulates network issues and reconnection logic
- **Message corruption**: Tests error handling for malformed messages

### ✅ Performance Tests

- **Delivery timing**: Ensures messages are delivered within acceptable timeframes
- **Throughput**: Tests system capacity under load

## Running Tests

### Prerequisites

- Docker and Docker Compose
- Node.js 22+
- pnpm 10.12.1+

### Local Execution

#### Quick Start

All commands below must be run from the repository root:

```bash
# Run complete e2e test suite (builds services, runs tests, cleans up)
pnpm run e2e:full

# Run tests against already running services
pnpm run e2e:local

# Set up services only
pnpm run e2e:setup

# Clean up services
pnpm run e2e:teardown
```

#### Manual Steps

```bash
# 1. Start services
docker-compose -f docker-compose.e2e.yml up -d

# 2. Wait for services to be ready
# Check health: docker-compose -f docker-compose.e2e.yml ps

# 3. Run tests
cd apps/tests/e2e
pnpm install
pnpm test

# 4. Cleanup
docker-compose -f docker-compose.e2e.yml down --volumes
```

#### Development Mode

```bash
# Start services in background
docker-compose -f docker-compose.e2e.yml up -d

# Run tests in watch mode
cd apps/tests/e2e
pnpm run test:watch

# Cleanup when done
docker-compose -f docker-compose.e2e.yml down --volumes
```

### CI/CD Execution

The tests automatically run in GitHub Actions on:

- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Manual workflow dispatch

## Service Configuration

### Services Included

- **RabbitMQ**: Message broker (port 8072 for management UI)
- **DMR Server 1**: Primary message routing server (port 8075)
- **DMR Server 2**: Secondary message routing server (port 8076)
- **DMR Agent A**: Connected to DMR Server 1 (port 8077)
- **DMR Agent B**: Connected to DMR Server 1 (port 8078)
- **External Service A**: Message sender (port 8073)
- **External Service B**: Message receiver (port 8074)

### Environment Variables for Local Testing

```bash
RABBITMQ_MANAGEMENT_URL=http://localhost:8072
EXTERNAL_SERVICE_A_URL=http://localhost:8073
EXTERNAL_SERVICE_B_URL=http://localhost:8074
DMR_SERVER_1_URL=http://localhost:8075
DMR_SERVER_2_URL=http://localhost:8076
DMR_AGENT_A_URL=http://localhost:8077
DMR_AGENT_B_URL=http://localhost:8078
```

Note: The port numbers listed above are for the e2e testing environment. For development environment port configuration, please refer to the main [README.md](../../README.md).

### Health Check Examples

```bash
curl http://localhost:8075/v1/health  # DMR Server
```

### Port Mapping Example

```yaml
ports:
  - '8075:8075'
```

### Example API Calls

```bash
# Send a message through External Service A
curl -X POST http://localhost:8073/api/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello World", "recipientId": "agent-b"}'

# Get last message from External Service B
curl http://localhost:8074/api/messages/last
```

### Health Check Endpoints

- DMR Server: http://localhost:8075/v1/health

## Test Configuration

### Timeouts

- **Test timeout**: 60 seconds per test
- **Service startup**: 5 minutes maximum
- **Message delivery**: 30 seconds maximum

### Agent Configuration

- **Agent A ID**: `d3b07384-d9a0-4c3f-a4e2-123456789abc`
- **Agent B ID**: `a1e45678-12bc-4ef0-9876-def123456789`

## Troubleshooting

### Common Issues

#### Services Not Starting

```bash
# Check service logs
docker-compose -f docker-compose.e2e.yml logs

# Check service status
docker-compose -f docker-compose.e2e.yml ps

# Force rebuild
docker-compose -f docker-compose.e2e.yml build --no-cache
```

#### Tests Failing

```bash
# Check if all services are healthy
docker-compose -f docker-compose.e2e.yml ps

# Verify service endpoints
curl http://localhost:8075/v1/health  # DMR Server
curl http://localhost:8077/v1/health  # DMR Agent A
curl http://localhost:8078/v1/health  # DMR Agent B
```

#### Port Conflicts

If you encounter port conflicts, modify the ports in `docker-compose.e2e.yml`:

```yaml
ports:
  - '8075:8075'
```

### Debugging

#### Enable Verbose Logging

```bash
# Set environment variable for detailed logs
export LOGGER_LOG_LEVELS=error,warn,log,debug,verbose

# Or modify docker-compose.e2e.yml
environment:
  - LOGGER_LOG_LEVELS=error,warn,log,debug,verbose
```

#### Manual Testing

```bash
# Send test message manually
curl -X POST http://localhost:8073/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "recipientId": "a1e45678-12bc-4ef0-9876-def123456789",
    "payload": {"test": "manual message"}
  }'

# Check received message
curl http://localhost:8074/api/messages/last
```

## Advanced Scenarios

### Multi-Server Testing

The setup supports testing with multiple DMR servers:

1. Uncomment `dmr-server-2` in `docker-compose.e2e.yml`
2. Configure Agent B to connect to Server 2
3. Test cross-server message routing

### Load Testing

```bash
# Run multiple test instances
for i in {1..5}; do
  pnpm test &
done
wait
```

### Network Failure Simulation

```bash
# Disconnect agent during test
docker network disconnect dmr-e2e_dmr-e2e dmr-agent-a-e2e

# Reconnect after delay
sleep 10
docker network connect dmr-e2e_dmr-e2e dmr-agent-a-e2e
```

## Contributing

When adding new tests:

1. Follow the existing test structure
2. Use descriptive test names
3. Include proper cleanup
4. Add appropriate timeouts
5. Update this README if needed

## Monitoring

### RabbitMQ Management

- URL: http://localhost:8071
- Username: `user`
- Password: `pass`

### Service Health Endpoints

- DMR Server: http://localhost:8075/v1/health
- DMR Agent A: http://localhost:8077/v1/health
- DMR Agent B: http://localhost:8078/v1/health
