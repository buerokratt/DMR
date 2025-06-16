export interface IGetAgentConfigListResponse {
  response: IAgentConfig[];
}

export interface IAgentConfig {
  id: string;
  name: string;
  authentication_certificate: string;
  created_at: string;
  updated_at: string;
}
