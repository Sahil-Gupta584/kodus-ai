import { Entity } from '@/shared/domain/interfaces/entity';
import { IPermissions } from '../types/permissions.types';

export class PermissionsEntity implements Entity<IPermissions> {
    private _uuid: string;
    private _assignedRepositoryIds: string[];
    private _user: Partial<IPermissions['user']>;

    private constructor(permissions: IPermissions | Partial<IPermissions>) {
        this._uuid = permissions.uuid;
        this._assignedRepositoryIds = permissions.assignedRepositoryIds || [];
        this._user = permissions.user || {};
    }

    public static create(
        permissions: IPermissions | Partial<IPermissions>,
    ): PermissionsEntity {
        return new PermissionsEntity(permissions);
    }

    public toObject(): IPermissions {
        return {
            uuid: this.uuid,
            assignedRepositoryIds: this.assignedRepositoryIds,
            user: this.user,
        };
    }

    public toJson(): IPermissions {
        return this.toObject();
    }

    public get uuid() {
        return this._uuid;
    }

    public get assignedRepositoryIds() {
        return [...this._assignedRepositoryIds];
    }

    public get user() {
        return this._user;
    }
}
