import { Role } from '@/core/domain/permissions/enums/permissions.enum';
import { Request } from 'express';

type User = { id: string; role: Role[] };

export type UserRequest = Request & { user: User };
