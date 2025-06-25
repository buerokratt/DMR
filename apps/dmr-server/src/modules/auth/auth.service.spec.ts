import { JwtPayload } from '@dmr/shared';
import { BadRequestException, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CentOpsService } from '../centops/centops.service';
import { AuthService } from './auth.service';

const mockCentOpsService = {
  getCentOpsConfigurationByClientId: vi.fn(),
};

const mockJwtService = {
  verifyAsync: vi.fn(),
  decode: vi.fn(),
};

describe('AuthService', () => {
  let authService: AuthService;
  let centOpsService: CentOpsService;
  let jwtService: JwtService;
  let loggerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: CentOpsService,
          useValue: mockCentOpsService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    centOpsService = module.get<CentOpsService>(CentOpsService);
    jwtService = module.get<JwtService>(JwtService);

    loggerSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    vi.clearAllMocks();
  });

  afterEach(() => {});

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  describe('verifyToken', () => {
    const testToken = 'mocked.jwt.token';
    const mockClientId = 'mockKid123';
    const mockPublicKey = '-----BEGIN PUBLIC KEY-----mockKey-----END PUBLIC KEY-----';
    const mockPayload: JwtPayload = { sub: mockClientId, iat: 123, exp: 123 }; // sub matches clientId

    it('should successfully verify a token', async () => {
      vi.spyOn(authService as any, 'getKidFromToken').mockReturnValue(mockClientId);
      mockCentOpsService.getCentOpsConfigurationByClientId.mockResolvedValueOnce({
        authenticationCertificate: mockPublicKey,
      });
      mockJwtService.verifyAsync.mockResolvedValueOnce(mockPayload);

      const result = await authService.verifyToken(testToken);

      expect(authService['getKidFromToken']).toHaveBeenCalledWith(testToken);
      expect(mockCentOpsService.getCentOpsConfigurationByClientId).toHaveBeenCalledWith(
        mockClientId,
      );
      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(testToken, {
        publicKey: mockPublicKey,
      });
      expect(result).toEqual(mockPayload);
    });

    it('should throw BadRequestException if getKidFromToken returns null', async () => {
      vi.spyOn(authService as any, 'getKidFromToken').mockReturnValue(null);

      await expect(authService.verifyToken(testToken)).rejects.toThrow(
        new BadRequestException('Token kid is missing or invalid'),
      );
      expect(authService['getKidFromToken']).toHaveBeenCalledWith(testToken);
      expect(mockCentOpsService.getCentOpsConfigurationByClientId).not.toHaveBeenCalled();
      expect(mockJwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('should throw an error if CentOpsService fails to get configuration', async () => {
      vi.spyOn(authService as any, 'getKidFromToken').mockReturnValue(mockClientId);
      const centOpsError = new Error('CentOps config error');
      mockCentOpsService.getCentOpsConfigurationByClientId.mockRejectedValueOnce(centOpsError);

      await expect(authService.verifyToken(testToken)).rejects.toThrow(centOpsError);
      expect(authService['getKidFromToken']).toHaveBeenCalledWith(testToken);
      expect(mockCentOpsService.getCentOpsConfigurationByClientId).toHaveBeenCalledWith(
        mockClientId,
      );
      expect(mockJwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException and log error if token verification fails', async () => {
      vi.spyOn(authService as any, 'getKidFromToken').mockReturnValue(mockClientId);
      mockCentOpsService.getCentOpsConfigurationByClientId.mockResolvedValueOnce({
        authenticationCertificate: mockPublicKey,
      });
      const verificationError = new Error('Invalid signature');
      mockJwtService.verifyAsync.mockRejectedValueOnce(verificationError);

      await expect(authService.verifyToken(testToken)).rejects.toThrow(
        new UnauthorizedException('Invalid token'),
      );
      expect(authService['getKidFromToken']).toHaveBeenCalledWith(testToken);
      expect(mockCentOpsService.getCentOpsConfigurationByClientId).toHaveBeenCalledWith(
        mockClientId,
      );
      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(testToken, {
        publicKey: mockPublicKey,
      });
      expect(loggerSpy).toHaveBeenCalledWith('Error verifying JWT:', verificationError.message);
    });

    it('should throw BadRequestException if token sub and kid do not match', async () => {
      const mismatchedPayload: JwtPayload = { sub: 'different-user', iat: 123, exp: 123 };
      vi.spyOn(authService as any, 'getKidFromToken').mockReturnValue(mockClientId);
      mockCentOpsService.getCentOpsConfigurationByClientId.mockResolvedValueOnce({
        authenticationCertificate: mockPublicKey,
      });
      mockJwtService.verifyAsync.mockResolvedValueOnce(mismatchedPayload);

      await expect(authService.verifyToken(testToken)).rejects.toThrow(
        new BadRequestException('Token sub and kid do not match'),
      );
      expect(authService['getKidFromToken']).toHaveBeenCalledWith(testToken);
      expect(mockCentOpsService.getCentOpsConfigurationByClientId).toHaveBeenCalledWith(
        mockClientId,
      );
      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(testToken, {
        publicKey: mockPublicKey,
      });
      expect(loggerSpy).toHaveBeenCalledWith('Token sub and kid do not match');
    });
  });

  describe('getKidFromToken (private method)', () => {
    const testToken = 'mocked.jwt.token';

    it('should return the kid if available in the header', () => {
      vi.spyOn(mockJwtService, 'decode').mockReturnValueOnce({
        header: { alg: 'RS256', typ: 'JWT', kid: 'expectedKid' },
        payload: {},
        signature: 'mock',
      });

      const kid = authService['getKidFromToken'](testToken);

      expect(mockJwtService.decode).toHaveBeenCalledWith(testToken, { complete: true });
      expect(kid).toBe('expectedKid');
    });

    it('should return null if kid is missing in the header', () => {
      vi.spyOn(mockJwtService, 'decode').mockReturnValueOnce({
        header: { alg: 'RS256', typ: 'JWT' },
        payload: {},
        signature: 'mock',
      });

      const kid = authService['getKidFromToken'](testToken);

      expect(mockJwtService.decode).toHaveBeenCalledWith(testToken, { complete: true });
      expect(kid).toBeNull();
    });

    it('should return null if kid is not a string', () => {
      vi.spyOn(mockJwtService, 'decode').mockReturnValueOnce({
        header: { alg: 'RS256', typ: 'JWT', kid: 123 },
        payload: {},
        signature: 'mock',
      });

      const kid = authService['getKidFromToken'](testToken);

      expect(mockJwtService.decode).toHaveBeenCalledWith(testToken, { complete: true });
      expect(kid).toBeNull();
    });

    it('should return null if header is missing from decoded token', () => {
      vi.spyOn(mockJwtService, 'decode').mockReturnValueOnce({
        payload: {},
        signature: 'mock',
      });

      const kid = authService['getKidFromToken'](testToken);

      expect(mockJwtService.decode).toHaveBeenCalledWith(testToken, { complete: true });
      expect(kid).toBeNull();
    });

    it('should return null if decoded token is null or not an object', () => {
      vi.spyOn(mockJwtService, 'decode').mockReturnValueOnce(null);
      const kid = authService['getKidFromToken'](testToken);

      expect(mockJwtService.decode).toHaveBeenCalledWith(testToken, { complete: true });
      expect(kid).toBeNull();
    });

    it('should return null and log error if jwtService.decode throws an error', () => {
      const decodeError = new Error('Invalid token format');
      vi.spyOn(mockJwtService, 'decode').mockImplementationOnce(() => {
        throw decodeError;
      });

      const kid = authService['getKidFromToken'](testToken);

      expect(mockJwtService.decode).toHaveBeenCalledWith(testToken, { complete: true });
      expect(kid).toBeNull();
      expect(loggerSpy).toHaveBeenCalledWith('Error decoding JWT:', decodeError.message);
    });
  });
});
