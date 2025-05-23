import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../services/auth.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        JWT_SECRET: 'test-secret',
        JWT_EXPIRES_IN: '12h',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_REFRESH_EXPIRES_IN: '7d',
      };
      return config[key];
    }),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateTokens', () => {
    it('should generate access and refresh tokens', async () => {
      const user = {
        id: '123',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user'],
      };

      mockJwtService.signAsync
        .mockResolvedValueOnce('mock-access-token')
        .mockResolvedValueOnce('mock-refresh-token');

      const result = await service.generateTokens(user);

      expect(result).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });

      expect(mockJwtService.signAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh access token with valid refresh token', async () => {
      const refreshToken = 'valid-refresh-token';
      const payload = { sub: '123', type: 'refresh' };

      mockJwtService.verifyAsync.mockResolvedValue(payload);
      mockJwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');

      const result = await service.refreshAccessToken(refreshToken);

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      const refreshToken = 'invalid-refresh-token';

      mockJwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      await expect(service.refreshAccessToken(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for non-refresh token', async () => {
      const refreshToken = 'access-token';
      const payload = { sub: '123', type: 'access' };

      mockJwtService.verifyAsync.mockResolvedValue(payload);

      await expect(service.refreshAccessToken(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('validateUser', () => {
    it('should return user for valid payload', async () => {
      const payload = {
        sub: '123',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user'],
      };

      const result = await service.validateUser(payload);

      expect(result).toEqual({
        id: '123',
        username: 'testuser',
        email: 'test@example.com',
        name: undefined,
        roles: ['user'],
        provider: 'local',
      });
    });

    it('should return null for payload without sub', async () => {
      const payload = {
        username: 'testuser',
        email: 'test@example.com',
      };

      const result = await service.validateUser(payload);

      expect(result).toBeNull();
    });
  });

  describe('extractTokenFromAuthHeader', () => {
    it('should extract token from Bearer header', () => {
      const authHeader = 'Bearer token123';
      const result = service.extractTokenFromAuthHeader(authHeader);

      expect(result).toBe('token123');
    });

    it('should return null for invalid header', () => {
      const authHeader = 'Invalid header';
      const result = service.extractTokenFromAuthHeader(authHeader);

      expect(result).toBeNull();
    });

    it('should return null for empty header', () => {
      const authHeader = '';
      const result = service.extractTokenFromAuthHeader(authHeader);

      expect(result).toBeNull();
    });
  });
});
