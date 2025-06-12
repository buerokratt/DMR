export interface IJwtHeader {
  alg?: string;
  typ?: string;
  kid?: string;
  [key: string]: unknown;
}

export interface IDecodedJwt {
  header: IJwtHeader;
  payload: unknown;
  signature: string;
}
