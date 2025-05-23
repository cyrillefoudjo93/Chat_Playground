import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-oauth2';
import { OktaUserProfileDto } from '../dto/auth.dto';

@Injectable()
export class OktaOAuth2Strategy extends PassportStrategy(Strategy, 'okta-oauth2') {
  constructor(private readonly configService: ConfigService) {
    const oktaDomain = configService.get('OKTA_DOMAIN');
    const clientId = configService.get('OKTA_CLIENT_ID');
    const clientSecret = configService.get('OKTA_CLIENT_SECRET');
    const callbackUrl = configService.get('OKTA_CALLBACK_URL') || 'http://localhost:3001/auth/okta/callback';

    // For development, use mock values if Okta is not configured
    const isDevelopment = configService.get('NODE_ENV') === 'development';
    
    if (!oktaDomain || !clientId || !clientSecret) {
      if (!isDevelopment) {
        throw new Error('Missing required Okta configuration: OKTA_DOMAIN, OKTA_CLIENT_ID, and OKTA_CLIENT_SECRET must be set');
      }
      
      // Use mock values for development
      console.warn('⚠️  Okta not configured. Using mock values for development.');
    }

    super({
      authorizationURL: `${oktaDomain || 'https://mock.okta.com'}/oauth2/default/v1/authorize`,
      tokenURL: `${oktaDomain || 'https://mock.okta.com'}/oauth2/default/v1/token`,
      clientID: clientId || 'mock-client-id',
      clientSecret: clientSecret || 'mock-client-secret',
      callbackURL: callbackUrl,
      scope: ['openid', 'profile', 'email', 'groups'],
      state: true,
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: any,
  ): Promise<any> {
    try {
      // Fetch user profile from Okta
      const userProfile = await this.fetchUserProfile(accessToken);
      
      if (!userProfile) {
        throw new UnauthorizedException('Failed to retrieve user profile from Okta');
      }

      // Transform Okta profile to our user format
      const user = {
        id: userProfile.sub,
        username: userProfile.email,
        email: userProfile.email,
        name: userProfile.name,
        givenName: userProfile.given_name,
        familyName: userProfile.family_name,
        picture: userProfile.picture,
        locale: userProfile.locale,
        roles: userProfile.groups || [],
        accessToken,
        refreshToken,
        provider: 'okta',
      };

      return done(null, user);
    } catch (error) {
      return done(error, false);
    }
  }

  private async fetchUserProfile(accessToken: string): Promise<OktaUserProfileDto | null> {
    try {
      const oktaDomain = this.configService.get('OKTA_DOMAIN');
      const response = await fetch(`${oktaDomain}/oauth2/default/v1/userinfo`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user profile: ${response.status} ${response.statusText}`);
      }

      const profile = await response.json();
      return profile as OktaUserProfileDto;
    } catch (error) {
      console.error('Error fetching Okta user profile:', error);
      return null;
    }
  }
}
