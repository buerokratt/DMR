import { JwtPayload } from './jwt-payload.interface';

export interface AgentConnectionData {
  jwtPayload: JwtPayload;
  authenticationCertificate: string;
}
