import { Inject, Injectable } from '@nestjs/common';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { REQUEST } from '@nestjs/core';
import { UserStatusChangeDto } from '@/core/infrastructure/http/dtos/user-status-change.dto';
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

    public async execute(userStatusChangeDto: UserStatusChangeDto): Promise<void> {
        const organizationId = userStatusChangeDto.userStatusChanges[0].organizationId;

        await this.codeReviewSettingsLogService.registerUserStatusLog({
            organizationAndTeamData: {
                organizationId,
                teamId: userStatusChangeDto.userStatusChanges[0].teamId || null,
            },
            userInfo: {
                userId: this?.request?.user?.uuid || '',
                userEmail: this?.request?.user?.email || '',
            },
            userStatusChanges: userStatusChangeDto.userStatusChanges.map(change => ({
                gitId: change.gitId,
                gitTool: change.gitTool,
                licenseStatus: change.licenseStatus,
            })),
        });
    }
}
