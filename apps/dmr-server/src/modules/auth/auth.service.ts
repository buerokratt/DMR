import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { CentOpsService } from '../centops/centops.service';
import { DecodedJwt, JwtHeader } from './interfaces/headers.interface';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '@dmr/shared';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly centOpsService: CentOpsService,
    private readonly jwtService: JwtService,
  ) {}

  async verifyToken(token: string): Promise<JwtPayload> {
    const clientId = this.getKidFromToken(token);

    if (!clientId) {
      throw new BadRequestException('Token kid is missing or invalid');
    }

    const clientConfig = await this.centOpsService.getCentOpsConfigurationByClientId(clientId);
    let verifiedToken: JwtPayload;

    try {
      verifiedToken = await this.jwtService.verifyAsync<JwtPayload>(token, {
        publicKey: clientConfig.authenticationCertificate,
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Error verifying JWT:', error.message);
      }

      throw new UnauthorizedException('Invalid token');
    }

    if (verifiedToken.sub !== clientId) {
      this.logger.error('Token sub and kid do not match');

      throw new BadRequestException('Token sub and kid do not match');
    }

    return verifiedToken;
  }

  private decodeJwtHeader(token: string): JwtHeader | null {
    try {
      const decoded: DecodedJwt = this.jwtService.decode(token, { complete: true });

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
