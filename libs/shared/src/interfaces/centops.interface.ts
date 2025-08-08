export interface IGetAgentConfigListResponse {
  response: {
    items: IAgentConfig[];
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface IAgentConfig {
  clientId: string;
  name: string;
  authenticationCertificate: string;
  createdAt: string;
  updatedAt: string;
}
