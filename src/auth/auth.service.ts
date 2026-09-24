import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

import {
  JwtService,
} from '@nestjs/jwt';

import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import * as argon2
  from 'argon2';

import {
  PrismaService,
} from '../prisma/prisma.service.js';

import {
  UsersService,
} from '../users/users.service.js';

import {
  LoginDto,
} from './dto/login.dto.js';

import {
  RefreshDto,
} from './dto/refresh.dto.js';

@Injectable()
export class AuthService {
  private readonly accessTokenSecret:
    string;

  private readonly accessTokenTtlSeconds:
    number;

  private readonly refreshTokenTtlDays:
    number;

  constructor(
    private readonly prisma:
      PrismaService,

    private readonly usersService:
      UsersService,

    private readonly jwtService:
      JwtService,

    private readonly configService:
      ConfigService,
  ) {
    const accessTokenSecret =
      this.configService
        .get<string>(
          'AUTH_ACCESS_TOKEN_SECRET',
        )
        ?.trim();

    if (
      !accessTokenSecret ||
      accessTokenSecret.length < 32
    ) {
      throw new Error(
        'AUTH_ACCESS_TOKEN_SECRET must contain at least 32 characters',
      );
    }

    const accessTokenTtlSeconds =
      Number(
        this.configService
          .get<string>(
            'AUTH_ACCESS_TOKEN_TTL_SECONDS',
          ) ??
          '900',
      );

    if (
      !Number.isInteger(
        accessTokenTtlSeconds,
      ) ||
      accessTokenTtlSeconds < 60 ||
      accessTokenTtlSeconds > 86400
    ) {
      throw new Error(
        'AUTH_ACCESS_TOKEN_TTL_SECONDS is invalid',
      );
    }

    const refreshTokenTtlDays =
      Number(
        this.configService
          .get<string>(
            'AUTH_REFRESH_TOKEN_TTL_DAYS',
          ) ??
          '30',
      );

    if (
      !Number.isInteger(
        refreshTokenTtlDays,
      ) ||
      refreshTokenTtlDays < 1 ||
      refreshTokenTtlDays > 365
    ) {
      throw new Error(
        'AUTH_REFRESH_TOKEN_TTL_DAYS is invalid',
      );
    }

    this.accessTokenSecret =
      accessTokenSecret;

    this.accessTokenTtlSeconds =
      accessTokenTtlSeconds;

    this.refreshTokenTtlDays =
      refreshTokenTtlDays;
  }

  async login(
    input:
      LoginDto,
  ) {
    const email =
      this.normalizeEmail(
        input.email,
      );

    const user =
      await this.usersService
        .findByEmail(
          email,
        );

    if (!user) {
      throw new UnauthorizedException(
        'Email ou palavra-passe inválidos.',
      );
    }

    let passwordValid =
      false;

    try {
      passwordValid =
        await argon2.verify(
          user.passwordHash,
          input.password,
        );
    } catch {
      passwordValid =
        false;
    }

    if (!passwordValid) {
      throw new UnauthorizedException(
        'Email ou palavra-passe inválidos.',
      );
    }

    if (
      user.status !==
      'ACTIVE'
    ) {
      throw new UnauthorizedException(
        'Esta conta não está disponível.',
      );
    }

    return this.createSession(
      user,
    );
  }

  async refresh(
    input:
      RefreshDto,
  ) {
    const parsed =
      this.parseRefreshToken(
        input.refreshToken,
      );

    const session =
      await this.prisma.session
        .findUnique({
          where: {
            id:
              parsed.sessionId,
          },

          include: {
            user:
              true,
          },
        });

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt <=
        new Date() ||
      session.user.status !==
        'ACTIVE'
    ) {
      throw new UnauthorizedException(
        'Refresh token inválido ou expirado.',
      );
    }

    const suppliedHash =
      this.hashRefreshSecret(
        parsed.secret,
      );

    if (
      !this.hashesMatch(
        suppliedHash,
        session.refreshTokenHash,
      )
    ) {
      throw new UnauthorizedException(
        'Refresh token inválido ou expirado.',
      );
    }

    const newSecret =
      this.generateRefreshSecret();

    const newRefreshTokenHash =
      this.hashRefreshSecret(
        newSecret,
      );

    await this.prisma.session
      .update({
        where: {
          id:
            session.id,
        },

        data: {
          refreshTokenHash:
            newRefreshTokenHash,

          lastUsedAt:
            new Date(),
        },
      });

    const accessToken =
      await this.issueAccessToken({
        userId:
          session.user.id,

        sessionId:
          session.id,
      });

    return {
      user:
        this.toPublicUser(
          session.user,
        ),

      tokens: {
        tokenType:
          'Bearer',

        accessToken,

        accessTokenExpiresIn:
          this.accessTokenTtlSeconds,

        refreshToken:
          this.composeRefreshToken(
            session.id,
            newSecret,
          ),

        refreshTokenExpiresAt:
          session.expiresAt,
      },
    };
  }

  async logout(
    input:
      RefreshDto,
  ) {
    let parsed: {
      sessionId:
        string;

      secret:
        string;
    };

    try {
      parsed =
        this.parseRefreshToken(
          input.refreshToken,
        );
    } catch {
      return {
        success:
          true,
      };
    }

    const session =
      await this.prisma.session
        .findUnique({
          where: {
            id:
              parsed.sessionId,
          },
        });

    if (
      !session ||
      session.revokedAt !== null
    ) {
      return {
        success:
          true,
      };
    }

    const suppliedHash =
      this.hashRefreshSecret(
        parsed.secret,
      );

    if (
      !this.hashesMatch(
        suppliedHash,
        session.refreshTokenHash,
      )
    ) {
      return {
        success:
          true,
      };
    }

    await this.prisma.session
      .update({
        where: {
          id:
            session.id,
        },

        data: {
          revokedAt:
            new Date(),
        },
      });

    return {
      success:
        true,
    };
  }

  private async createSession(
    user: {
      id:
        string;

      email:
        string;

      name:
        string;

      passwordHash:
        string;

      status:
        string;

      systemRole:
        string;

      emailVerifiedAt:
        | Date
        | null;

      createdAt:
        Date;

      updatedAt:
        Date;
    },
  ) {
    const sessionId =
      randomUUID();

    const refreshSecret =
      this.generateRefreshSecret();

    const refreshTokenHash =
      this.hashRefreshSecret(
        refreshSecret,
      );

    const expiresAt =
      new Date(
        Date.now() +
          this.refreshTokenTtlDays *
            24 *
            60 *
            60 *
            1000,
      );

    await this.prisma.session
      .create({
        data: {
          id:
            sessionId,

          userId:
            user.id,

          refreshTokenHash,

          expiresAt,

          lastUsedAt:
            new Date(),
        },
      });

    const accessToken =
      await this.issueAccessToken({
        userId:
          user.id,

        sessionId,
      });

    return {
      user:
        this.toPublicUser(
          user,
        ),

      tokens: {
        tokenType:
          'Bearer',

        accessToken,

        accessTokenExpiresIn:
          this.accessTokenTtlSeconds,

        refreshToken:
          this.composeRefreshToken(
            sessionId,
            refreshSecret,
          ),

        refreshTokenExpiresAt:
          expiresAt,
      },
    };
  }

  private issueAccessToken(
    input: {
      userId:
        string;

      sessionId:
        string;
    },
  ) {
    return this.jwtService
      .signAsync(
        {
          sub:
            input.userId,

          sid:
            input.sessionId,

          type:
            'access',
        },

        {
          secret:
            this.accessTokenSecret,

          algorithm:
            'HS256',

          expiresIn:
            this.accessTokenTtlSeconds,
        },
      );
  }

  private normalizeEmail(
    email:
      string,
  ) {
    return email
      .trim()
      .toLowerCase();
  }

  private generateRefreshSecret() {
    return randomBytes(
      32,
    ).toString(
      'base64url',
    );
  }

  private composeRefreshToken(
    sessionId:
      string,

    secret:
      string,
  ) {
    return `${sessionId}.${secret}`;
  }

  private parseRefreshToken(
    refreshToken:
      string,
  ) {
    const separatorIndex =
      refreshToken.indexOf(
        '.',
      );

    if (
      separatorIndex <= 0 ||
      separatorIndex ===
        refreshToken.length - 1
    ) {
      throw new UnauthorizedException(
        'Refresh token inválido ou expirado.',
      );
    }

    const sessionId =
      refreshToken.slice(
        0,
        separatorIndex,
      );

    const secret =
      refreshToken.slice(
        separatorIndex + 1,
      );

    if (
      !sessionId ||
      !/^[A-Za-z0-9_-]{43}$/.test(
        secret,
      )
    ) {
      throw new UnauthorizedException(
        'Refresh token inválido ou expirado.',
      );
    }

    return {
      sessionId,
      secret,
    };
  }

  private hashRefreshSecret(
    secret:
      string,
  ) {
    return createHash(
      'sha256',
    )
      .update(
        secret,
        'utf8',
      )
      .digest(
        'hex',
      );
  }

  private hashesMatch(
    first:
      string,

    second:
      string,
  ) {
    if (
      !/^[a-f0-9]{64}$/.test(
        first,
      ) ||
      !/^[a-f0-9]{64}$/.test(
        second,
      )
    ) {
      return false;
    }

    const firstBuffer =
      Buffer.from(
        first,
        'hex',
      );

    const secondBuffer =
      Buffer.from(
        second,
        'hex',
      );

    if (
      firstBuffer.length !==
        secondBuffer.length
    ) {
      return false;
    }

    return timingSafeEqual(
      firstBuffer,
      secondBuffer,
    );
  }

  private toPublicUser(
    user: {
      id:
        string;

      email:
        string;

      name:
        string;

      status:
        string;

      systemRole:
        string;

      emailVerifiedAt:
        | Date
        | null;

      createdAt:
        Date;

      updatedAt:
        Date;
    },
  ) {
    return {
      id:
        user.id,

      email:
        user.email,

      name:
        user.name,

      status:
        user.status,

      systemRole:
        user.systemRole,

      emailVerifiedAt:
        user.emailVerifiedAt,

      createdAt:
        user.createdAt,

      updatedAt:
        user.updatedAt,
    };
  }
}