import type {
  Request,
} from 'express';

export type SystemRoleValue =
  | 'USER'
  | 'PLATFORM_ADMIN';

export interface AccessTokenPayload {
  sub: string;

  sid: string;

  type:
    'access';

  iat?:
    number;

  exp?:
    number;
}

export interface AuthenticatedUser {
  id: string;

  email: string;

  name: string;

  status:
    'ACTIVE';

  systemRole:
    SystemRoleValue;

  sessionId: string;
}

export interface AuthenticatedRequest
  extends Request {
  user:
    AuthenticatedUser;
}