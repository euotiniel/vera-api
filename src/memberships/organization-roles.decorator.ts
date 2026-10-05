import {
  SetMetadata,
} from '@nestjs/common';

import type {
  OrganizationRoleValue,
} from './organization-role.types.js';

export const ORGANIZATION_ROLES_KEY =
  'vera.organizationRoles';

export const OrganizationRoles = (
  ...roles:
    OrganizationRoleValue[]
) =>
  SetMetadata(
    ORGANIZATION_ROLES_KEY,
    roles,
  );