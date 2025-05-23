import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../services/auth.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    getAuthStatus: jest.fn(),
    generateTokens: jest.fn(),
    refreshAccessToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAuthStatus', () => {
    it('should return auth status for authenticated user', async () => {
      const user = {
        id: '123',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user'],
      };

      const authStatus = {
        authenticated: true,
        user,
        token: 'mock-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: new Date(),
      };

      mockAuthService.getAuthStatus.mockResolvedValue(authStatus);

      const req = { user } as any;
      const result = await controller.getAuthStatus(req);

      expect(result).toEqual(authStatus);
      expect(mockAuthService.getAuthStatus).toHaveBeenCalledWith(user);
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const refreshToken = 'valid-refresh-token';
      const tokens = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };

      mockAuthService.refreshAccessToken.mockResolvedValue(tokens);

      const result = await controller.refreshToken(refreshToken);

      expect(result).toEqual({
        success: true,
        ...tokens,
      });
    });

    it('should throw UnauthorizedException for missing refresh token', async () => {
      await expect(controller.refreshToken('')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      const refreshToken = 'invalid-refresh-token';
      
      mockAuthService.refreshAccessToken.mockRejectedValue(
        new UnauthorizedException('Invalid token'),
      );

      await expect(controller.refreshToken(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const user = {
        id: '123',
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        picture: 'profile-pic.jpg',
        roles: ['user'],
        provider: 'okta',
      };

      const req = { user } as any;
      const result = await controller.getProfile(req);

      expect(result).toEqual({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name,
          picture: user.picture,
          roles: user.roles,
          provider: user.provider,
        },
      });
    });
  });

  describe('updateProfile', () => {
    it('should update user profile', async () => {
      const user = {
        id: '123',
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['user'],
      };

      const profileData = {
        name: 'Updated Name',
        picture: 'new-picture-url',
      };

      const req = { user } as any;
      const result = await controller.updateProfile(req, profileData);

      expect(result.success).toBe(true);
      expect(result.user.name).toBe('Updated Name');
      expect(result.user.picture).toBe('new-picture-url');
    });
  });
});
