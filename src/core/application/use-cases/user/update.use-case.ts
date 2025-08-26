import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Inject, NotFoundException } from '@nestjs/common';
import {
    IPasswordService,
    PASSWORD_SERVICE_TOKEN,
} from '@/core/domain/user/contracts/password.service.contract';
import {
    IUsersService,
    USER_SERVICE_TOKEN,
} from '@/core/domain/user/contracts/user.service.contract';
import { IUser } from '@/core/domain/user/interfaces/user.interface';
import posthogClient from '@/shared/utils/posthog';
import { UpdateUserDto } from '@/core/infrastructure/http/dtos/update.dto';
import { UserRole } from '@/core/domain/user/enums/userRole.enum';

export class UpdateUserUseCase implements IUseCase {
    constructor(
        @Inject(USER_SERVICE_TOKEN)
        private readonly usersService: IUsersService,
        @Inject(PASSWORD_SERVICE_TOKEN)
        private readonly passwordService: IPasswordService,
    ) {}

    public async execute(uuid: string, data: UpdateUserDto): Promise<IUser> {
        const usersExists = await this.usersService.count({ uuid });

        if (!usersExists) {
            throw new NotFoundException('api.users.not_found');
        }

        if (data.password) {
            data.password = await this.passwordService.generate(
                data.password,
                10,
            );
        }

        let role: UserRole[] | undefined = undefined;
        if (data.role) {
            role = [data.role];
        }

        const user = await this.usersService.update(
            { uuid },
            {
                ...data,
                role,
            },
        );

        posthogClient.userIdentify(user);

        return user.toObject();
    }
}
