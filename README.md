# DMR (Distributed Message Rooms)

## Business case

Currently, there is no way to pass questions from one Bürokratt instance to another. This means that if an end-user asks a question that the local Bürokratt instance cannot answer, he will receive no meaningful reply — even if some other Bürokratt instance could answer it.

An example: a user comes to the Tax Authority web, and asks a question about crime, the Tax Authority instance will not be able to answer it. The Police instance **is able** to answer the question but there is no way to forward it.

So the goal is to built a system that can efficiently and securely forward questions and answers between Bürokratt instances.

## Architecture chart

```mermaid
%%{ init: { "theme": "default", "flowchart": { "htmlLabels": true, "curve": "linear" } } }%%
graph TD
  subgraph Client A cluster
    A1[DMR Agent A]
    A2[Other Services A]
    A1 <--> A2
  end

  subgraph Central cluster
    S[DMR Server]:::bold
    MQ[RabbitMQ Cluster]
    CO((CentOps<br/><i>not in scope</i>)):::grey
  end

  subgraph Client B cluster
    B1[DMR Agent B]
    B2[Other Services B]
    B1 <--> B2
  end

  A1 <--> S
  B1 <--> S
  S <--> MQ
  CO -->|configuration| S

  classDef bold stroke:#333,stroke-width:2;
  classDef grey fill:#e0e0e0,stroke:#888,stroke-width:1;
```

## Key components

### DMR agents

- DMR agents run in every client's Bürokratt cluster. They are responsible for forwarding messages to the DMR Server and receiving messages from it in real-time. This is done via a WebSocket connection.
- DMR agents encrypt and decrypt messages using public-key cryptography. Private keys are delivered to the agents at infrastructure level. Other DMR agents' public keys are distributed by DMR server on establishing a WebSocket connection.
- Metadata needed to pass the messages along — like sender and recipient IDs — is not encrypted.
- The DMR agents also expose an API for communicating with other services in the client's Bürokratt cluster.

### DMR server

- Key functionality is to forward the messages between DMR agents using RabbitMQ.
- Uses WebSockets to exchange messages with DMR agents.
- Gets its configuration from CentOps. CentOps is developed separately and is **out of scope for this project**.
- Can also distribute configuration to DMR agents if necessary, namely a list of other DMR agents and their public keys.
- DMR server _itself_ is lightweight and stateless, it does not store any messages or configuration data in any sort of a DB.
- **Cannot** read the message contents, these are encrypted by the DMR agents.
- There can be several instances of DMR server running, depending on load.
- In the future, can potentially be extended to perform operations — like applying policies — on incoming and outgoing messages.

### RabbitMQ

- Has per-Agent message queues.
- Has a dead letter queue for messages that failed to deliver.
- Has RabbitMQ UI-based monitoring tools set up.
- Supports RabbitMQ clustering for scalability.