import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class OktaCallbackDto {
  @IsNotEmpty()
  @IsString()
  code: string;

  @IsOptional()
  @IsString()
  state?: string;
}

export class OktaUserProfileDto {
  @IsNotEmpty()
  @IsString()
  sub: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  given_name?: string;

  @IsOptional()
  @IsString()
  family_name?: string;

  @IsOptional()
  @IsUrl()
  picture?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  groups?: string[];
}

export class AuthStatusDto {
  @IsNotEmpty()
  authenticated: boolean;

  @IsOptional()
  user?: {
    id: string;
    username: string;
    email: string;
    name?: string;
    picture?: string;
    roles?: string[];
  };

  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsNotEmpty()
  expiresAt: Date;
}
