import { CoreModel } from '@/shared/infrastructure/repositories/model/typeOrm';
import { Column, Entity, OneToOne } from 'typeorm';
import { UserModel } from './user.model';

@Entity('permissions')
export class PermissionsModel extends CoreModel {
    @OneToOne(() => UserModel, (user) => user.permissions)
    user: UserModel;

    @Column({
        type: 'text',
        array: true,
        default: () => "'{}'",
    })
    assignedRepositoryIds: string[];
}
