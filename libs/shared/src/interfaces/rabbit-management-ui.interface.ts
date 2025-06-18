export interface IRabbitQueue {
  arguments: IArguments;
  auto_delete: boolean;
  durable: boolean;
  exclusive: boolean;
  leader: string;
  members: string[];
  name: string;
  node: string;
  online: string[];
  state: string;
  type: string;
  vhost: string;
}

interface IArguments {
  'x-dead-letter-exchange': string;
  'x-dead-letter-routing-key': string;
  'x-message-ttl': number;
  'x-queue-type': string;
}

export interface IVHost {
  name: string;
  description: string;
  metadata: IMetadata;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tags: any[];
  default_queue_type: string;
  protected_from_deletion: boolean;
  tracing: boolean;
  cluster_state: IClusterState;
}

interface IMetadata {
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tags: any[];
  default_queue_type: string;
}

interface IClusterState {
  [key: string]: string;
}
