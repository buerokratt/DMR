export interface IAgent {
  id: string;
  name: string;
  authenticationCertificate: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}
export interface IAgentList {
  response: IAgent[];
}
