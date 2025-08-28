import {
    ORGANIZATION_SERVICE_TOKEN,
    IOrganizationService,
} from '@/core/domain/organization/contracts/organization.service.contract';
import {
    TEAM_SERVICE_TOKEN,
    ITeamService,
} from '@/core/domain/team/contracts/team.service.contract';
import {
    TEAM_MEMBERS_SERVICE_TOKEN,
    ITeamMemberService,
} from '@/core/domain/teamMembers/contracts/teamMembers.service.contracts';
import {
    USER_SERVICE_TOKEN,
    IUsersService,
} from '@/core/domain/user/contracts/user.service.contract';
import { UserRole } from '@/core/domain/user/enums/userRole.enum';
import { IUser } from '@/core/domain/user/interfaces/user.interface';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { UpdateAnotherUserDto } from '@/core/infrastructure/http/dtos/update-another-user.dto';
import { UpdateUserDto } from '@/core/infrastructure/http/dtos/update.dto';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class UpdateAnotherUserUseCase implements IUseCase {
    constructor(
        @Inject(USER_SERVICE_TOKEN)
        private readonly usersService: IUsersService,

        @Inject(ORGANIZATION_SERVICE_TOKEN)
        private readonly organizationService: IOrganizationService,

        @Inject(TEAM_SERVICE_TOKEN)
        private readonly teamService: ITeamService,

        @Inject(TEAM_MEMBERS_SERVICE_TOKEN)
        private readonly teamMembersService: ITeamMemberService,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(
        userId: string,
        targetUserId: string,
        data: UpdateAnotherUserDto,
    ): Promise<IUser> {
        const { role, status } = data;

        try {
            const mainUser = await this.usersService.findOne({ uuid: userId });
            if (!mainUser) {
                throw new Error('User not found');
            }

            if (!mainUser.role?.includes(UserRole.OWNER)) {
                throw new Error('Only owners can update other users');
            }

            const targetUser = await this.usersService.findOne({
                uuid: targetUserId,
            });
            if (!targetUser) {
                throw new Error('Target user not found');
            }

            const organization = await this.organizationService.findOne({
                uuid: mainUser.organization?.uuid,
            });
            if (!organization) {
                throw new Error('Organization not found');
            }

            const team = await this.teamService.findOne({
                organization: {
                    uuid: organization.uuid,
                },
            });
            if (!team) {
                throw new Error('Team not found');
            }

            const teamMember = await this.teamMembersService.findOne({
                organization: {
                    uuid: organization.uuid,
                },
                team: {
                    uuid: team.uuid,
                },
                user: {
                    uuid: targetUser.uuid,
                },
            });
            if (!teamMember) {
                throw new Error(
                    'Target user is not a member of the organization team',
                );
            }

            let updatedRole: UserRole[] | undefined = undefined;
            if (role) {
                updatedRole = [role];
            }

            const updatedUser = await this.usersService.update(
                { uuid: targetUserId },
                {
                    status,
                    role: updatedRole,
                },
            );

            if (!updatedUser) {
                throw new Error('Error updating user');
            }

            this.logger.log({
                message: 'User updated another user',
                context: UpdateAnotherUserUseCase.name,
                metadata: { userId, targetUserId, data },
            });

            return updatedUser.toObject();
        } catch (error) {
            this.logger.error({
                message: 'Error updating another user',
                error,
                metadata: { userId, targetUserId, data },
                context: UpdateAnotherUserUseCase.name,
            });
            throw error;
        }
    }
}
