import { UserRole } from '@prisma/client';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SanitizedUser {
  id: string;
  tenantId: string;
  customerId?: string | null;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
  headline?: string | null;
  phone?: string | null;
  location?: string | null;
  pronouns?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  calendlyUrl?: string | null;
  role: UserRole;
  lastLoginAt?: Date | null;
  createdAt: Date;
}

export interface AuthResponse {
  user: SanitizedUser;
  tokens: AuthTokens;
}

export interface TwoFactorChallenge {
  requiresTwoFactor: true;
  deviceId: string;
  expiresAt: string;
}

export type LoginResponse = AuthResponse | TwoFactorChallenge;

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  tenantId: string;
  customerId?: string | null;
}

export interface AuthUser extends JwtPayload {
  iat?: number;
  exp?: number;
}
