import { Inject, Injectable } from '@nestjs/common';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { REQUEST } from '@nestjs/core';
import { UserStatusDto } from '@/core/infrastructure/http/dtos/user-status-change.dto';
import {
    CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN,
    ICodeReviewSettingsLogService
} from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.service.contract';
import {
    IUsersService,
    USER_SERVICE_TOKEN,
} from '@/core/domain/user/contracts/user.service.contract';
import {
    ITeamService,
    TEAM_SERVICE_TOKEN,
} from '@/core/domain/team/contracts/team.service.contract';
import { ActionType } from '@/config/types/general/codeReviewSettingsLog.type';

@Injectable()
export class RegisterUserStatusLogUseCase implements IUseCase {
    constructor(
        @Inject(CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN)
        private readonly codeReviewSettingsLogService: ICodeReviewSettingsLogService,

        @Inject(USER_SERVICE_TOKEN)
        private readonly usersService: IUsersService,

        @Inject(TEAM_SERVICE_TOKEN)
        private readonly teamService: ITeamService,

        @Inject(REQUEST)
        private readonly request: Request & {
            user: {
                organization: { uuid: string };
                uuid: string;
                email: string;
            };
        },
    ) {}

    public async execute(userStatusDto: UserStatusDto): Promise<void> {
        const organizationId = userStatusDto.organizationId;

        await this.codeReviewSettingsLogService.registerUserStatusLog({
            organizationAndTeamData: {
                organizationId,
                teamId: userStatusDto.teamId || null,
            },
            userInfo: {
                userId: userStatusDto.editedBy.userId || '',
                userEmail: userStatusDto.editedBy.email || '',
            },
            userStatusChanges: [userStatusDto],
            actionType: ActionType.EDIT,
        });
    }
}
