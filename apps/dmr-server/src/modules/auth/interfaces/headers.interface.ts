export interface JwtHeader {
  alg?: string;
  typ?: string;
  kid?: string;
  [key: string]: unknown;
}

export interface DecodedJwt {
  header: JwtHeader;
  payload: unknown;
  signature: string;
}
