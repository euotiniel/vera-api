import {
  SetMetadata,
} from '@nestjs/common';

import type {
  SystemRoleValue,
} from './auth.types.js';

export const SYSTEM_ROLES_KEY =
  'vera.systemRoles';

export const SystemRoles = (
  ...roles:
    SystemRoleValue[]
) =>
  SetMetadata(
    SYSTEM_ROLES_KEY,
    roles,
  );