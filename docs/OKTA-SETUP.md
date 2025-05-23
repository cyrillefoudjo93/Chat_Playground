# Okta OAuth2 Setup Guide

This guide explains how to configure Okta OAuth2 authentication for the Chat Playground application.

## Overview

The application uses Okta as an identity provider (IdP) for user authentication. The implementation supports:
- OAuth2 Authorization Code flow with PKCE
- JWT token-based authentication
- Automatic token refresh
- User profile management
- Session management
- WebSocket authentication

## Okta Configuration

### 1. Create Okta Application

1. **Login to Okta Admin Console**
   - Go to your Okta organization (e.g., `https://your-org.okta.com/admin`)
   - Navigate to **Applications** > **Applications**

2. **Create New Application**
   - Click **Create App Integration**
   - Select **OIDC - OpenID Connect**
   - Choose **Web Application**
   - Click **Next**

3. **Configure Application Settings**
   ```
   App integration name: Chat Playground
   Grant type: Authorization Code
   Sign-in redirect URIs:
     - http://localhost:3001/auth/okta/callback (development)
     - https://your-domain.com/auth/okta/callback (production)
   
   Sign-out redirect URIs:
     - http://localhost:5173 (development)
     - https://your-domain.com (production)
   
   Controlled access: Choose based on your needs
   ```

4. **Note Your Credentials**
   After creation, note:
   - **Client ID**: Found in the General tab
   - **Client Secret**: Found in the General tab
   - **Okta Domain**: Your organization URL (e.g., `https://your-org.okta.com`)

### 2. Configure User Groups (Optional)

1. **Create Groups**
   - Navigate to **Directory** > **Groups**
   - Create groups like: `chat-users`, `chat-admins`, `chat-moderators`

2. **Assign Users to Groups**
   - Go to **Directory** > **People**
   - Select users and assign to appropriate groups

3. **Configure Group Claims**
   - In your application, go to **Sign On** tab
   - Click **Edit** in OpenID Connect ID Token section
   - Add group claim:
     ```
     Name: groups
     Include in token type: ID Token, Always
     Value type: Groups
     Filter: Matches regex .*
     Include in: Any scope
     ```

## Environment Configuration

### Development Setup

Update your `.env` file:

```bash
# Okta OAuth2 Configuration
OKTA_DOMAIN=https://your-org.okta.com
OKTA_CLIENT_ID=your_client_id_here
OKTA_CLIENT_SECRET=your_client_secret_here
OKTA_CALLBACK_URL=http://localhost:3001/auth/okta/callback

# Session Configuration
SESSION_SECRET=your-secure-session-secret-change-in-production

# JWT Configuration
JWT_SECRET=your-jwt-secret-change-in-production
JWT_EXPIRES_IN=12h
JWT_REFRESH_SECRET=your-jwt-refresh-secret-change-in-production
JWT_REFRESH_EXPIRES_IN=7d

# Application URLs
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:3001
```

### Production Setup

For production, ensure:
1. Use secure secrets (generate using `openssl rand -base64 32`)
2. Enable HTTPS for all URLs
3. Set appropriate CORS origins
4. Configure secure session cookies

## API Endpoints

The application provides the following authentication endpoints:

### OAuth2 Flow

1. **Initiate Login**
   ```
   GET /api/auth/okta
   ```
   - Redirects to Okta for authentication
   - Includes state parameter for CSRF protection

2. **Handle Callback**
   ```
   GET /api/auth/okta/callback?code=...&state=...
   ```
   - Processes OAuth2 callback
   - Exchanges authorization code for tokens
   - Returns JWT tokens and user info

### Token Management

3. **Check Auth Status**
   ```
   GET /api/auth/status
   Authorization: Bearer <jwt_token>
   ```
   - Returns current user information
   - Validates JWT token

4. **Refresh Token**
   ```
   POST /api/auth/refresh
   Content-Type: application/json
   
   {
     "refreshToken": "your_refresh_token"
   }
   ```

5. **User Profile**
   ```
   GET /api/auth/profile
   Authorization: Bearer <jwt_token>
   ```

6. **Logout**
   ```
   POST /api/auth/logout
   Authorization: Bearer <jwt_token>
   ```

## WebSocket Authentication

WebSocket connections support JWT authentication via:

1. **Handshake Auth Token** (Recommended)
   ```javascript
   const socket = io('/chat', {
     auth: {
       token: 'your_jwt_token'
     }
   });
   ```

2. **Authorization Header**
   ```javascript
   const socket = io('/chat', {
     extraHeaders: {
       Authorization: 'Bearer your_jwt_token'
     }
   });
   ```

3. **Query Parameter** (Less secure)
   ```javascript
   const socket = io('/chat?token=your_jwt_token');
   ```

## Testing

### Manual Testing

Use the provided test script:

```bash
cd server
chmod +x test-auth-comprehensive.sh
./test-auth-comprehensive.sh
```

### Frontend Integration

Example React implementation:

```typescript
// Login redirect
const handleLogin = () => {
  window.location.href = 'http://localhost:3001/api/auth/okta';
};

// Check auth status
const checkAuthStatus = async () => {
  const token = localStorage.getItem('jwt_token');
  if (!token) return null;
  
  const response = await fetch('/api/auth/status', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (response.ok) {
    return await response.json();
  }
  return null;
};

// WebSocket with auth
const connectSocket = (token: string) => {
  return io('/chat', {
    auth: { token }
  });
};
```

## Security Considerations

1. **Secrets Management**
   - Never commit secrets to version control
   - Use environment variables
   - Rotate secrets regularly

2. **CORS Configuration**
   - Limit allowed origins in production
   - Enable credentials for OAuth2 flow

3. **Session Security**
   - Use secure session secrets
   - Enable httpOnly cookies
   - Set appropriate session timeouts

4. **Token Security**
   - Use strong JWT secrets
   - Implement token rotation
   - Set appropriate expiration times

## Troubleshooting

### Common Issues

1. **Redirect URI Mismatch**
   - Ensure callback URLs match exactly in Okta
   - Check for trailing slashes
   - Verify HTTP vs HTTPS

2. **CORS Errors**
   - Check ALLOWED_ORIGINS environment variable
   - Ensure credentials are enabled
   - Verify origin headers

3. **Token Validation Errors**
   - Check JWT_SECRET configuration
   - Verify token expiration
   - Ensure clock synchronization

### Debug Mode

Enable debug logging by setting:
```bash
NODE_ENV=development
```

This will:
- Use mock Okta values for testing
- Enable verbose logging
- Provide detailed error messages

## Development vs Production

### Development Mode
- Uses mock Okta configuration if credentials not provided
- Allows HTTP URLs
- Enables verbose logging
- Relaxed CORS policies

### Production Mode
- Requires valid Okta configuration
- Enforces HTTPS
- Minimal logging
- Strict security policies

## Support

For issues related to:
- **Okta Configuration**: Check Okta documentation
- **Application Setup**: See server README.md
- **Frontend Integration**: See frontend documentation

## References

- [Okta Developer Documentation](https://developer.okta.com/)
- [OAuth2 Authorization Code Flow](https://oauth.net/2/grant-types/authorization-code/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [NestJS Passport Integration](https://docs.nestjs.com/security/authentication)
