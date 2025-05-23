import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Res,
  Query,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AuthService, User } from '../services/auth.service';
import { OktaCallbackDto, AuthStatusDto } from '../dto/auth.dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getAuthStatus(@Req() req: Request & { user: User }): Promise<AuthStatusDto> {
    return this.authService.getAuthStatus(req.user);
  }

  @Get('okta')
  @UseGuards(AuthGuard('okta-oauth2'))
  async oktaLogin() {
    // This endpoint initiates the Okta OAuth2 flow
    // The actual redirect is handled by Passport
  }

  @Get('okta/callback')
  @UseGuards(AuthGuard('okta-oauth2'))
  async oktaCallback(@Req() req: Request & { user: User }, @Res() res: Response) {
    try {
      // Generate JWT tokens for the authenticated user
      const { accessToken, refreshToken } = await this.authService.generateTokens(req.user);
      
      this.logger.log(`User ${req.user.username} successfully authenticated via Okta`);

      // Set secure HTTP-only cookies
      res.cookie('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 12 * 60 * 60 * 1000, // 12 hours
      });

      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Redirect to frontend with success
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/success?token=${accessToken}`);
    } catch (error) {
      this.logger.error('Okta callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/error?message=Authentication failed`);
    }
  }

  @Post('refresh')
  async refreshToken(@Body('refreshToken') refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    try {
      const tokens = await this.authService.refreshAccessToken(refreshToken);
      return {
        success: true,
        ...tokens,
      };
    } catch (error) {
      this.logger.error('Token refresh failed:', error);
      throw new UnauthorizedException('Failed to refresh token');
    }
  }

  @Post('refresh-cookie')
  async refreshTokenFromCookie(@Req() req: Request, @Res() res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found in cookies');
    }

    try {
      const { accessToken, refreshToken: newRefreshToken } = await this.authService.refreshAccessToken(refreshToken);
      
      // Update cookies
      res.cookie('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 12 * 60 * 60 * 1000, // 12 hours
      });

      res.cookie('refresh_token', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.json({
        success: true,
        message: 'Tokens refreshed successfully',
      });
    } catch (error) {
      this.logger.error('Cookie token refresh failed:', error);
      throw new UnauthorizedException('Failed to refresh token');
    }
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: Request, @Res() res: Response) {
    // Clear cookies
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    
    this.logger.log(`User logged out`);
    
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: Request & { user: User }) {
    return {
      success: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        name: req.user.name,
        picture: req.user.picture,
        roles: req.user.roles,
        provider: req.user.provider,
      },
    };
  }

  @Post('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Req() req: Request & { user: User },
    @Body() profileData: { name?: string; picture?: string },
  ) {
    // In a real application, you would update the user in the database
    // For now, we'll just return the updated profile
    const updatedUser = {
      ...req.user,
      ...profileData,
    };

    this.logger.log(`Profile updated for user ${req.user.username}`);

    return {
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        name: updatedUser.name,
        picture: updatedUser.picture,
        roles: updatedUser.roles,
      },
    };
  }
}
