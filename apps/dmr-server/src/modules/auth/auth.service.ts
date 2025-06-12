import { Injectable, Logger } from '@nestjs/common';
import { CentOpsService } from '../centops/centops.service';
import { IDecodedJwt, IJwtHeader } from './interfaces/heades.interface';
import { JwtService } from '@nestjs/jwt';
import { IJwtPayload } from '@dmr/shared';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly centOpsService: CentOpsService,
    private readonly jwtService: JwtService,
  ) {}

  async verifyToken(token: string) {
    const clientId = this.getKidFromToken(token);
    const clientConfig = await this.centOpsService.getCentOpsConfigurationByClientId(clientId);

    return this.jwtService.verifyAsync<IJwtPayload>(token, {
      publicKey: clientConfig.authenticationCertificate,
    });
  }

  private decodeJwtHeader(token: string): IJwtHeader | null {
    try {
      const decoded: IDecodedJwt = this.jwtService.decode(token, { complete: true });

      if (
        decoded &&
        typeof decoded === 'object' &&
        decoded.header &&
        typeof decoded.header === 'object'
      ) {
        return decoded.header;
      }

      return null;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Error decoding JWT:', error.message);
      }
      return null;
    }
  }

  private getKidFromToken(token: string): string | null {
    const header = this.decodeJwtHeader(token);

    if (header && typeof header.kid === 'string') {
      return header.kid;
    }

    return null;
  }
}
