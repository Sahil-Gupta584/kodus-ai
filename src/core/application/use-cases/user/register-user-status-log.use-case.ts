import { Inject, Injectable } from '@nestjs/common';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { UserStatusDto } from '@/core/infrastructure/http/dtos/user-status-change.dto';
import {
    CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN,
    ICodeReviewSettingsLogService
} from '@/core/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.service.contract';
import { ActionType } from '@/config/types/general/codeReviewSettingsLog.type';

@Injectable()
export class RegisterUserStatusLogUseCase implements IUseCase {
    constructor(
        @Inject(CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN)
        private readonly codeReviewSettingsLogService: ICodeReviewSettingsLogService,
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
            userStatusChanges: [
                {
                    gitId: userStatusDto.gitId,
                    gitTool: userStatusDto.gitTool,
                    userName: userStatusDto.userName,
                    licenseStatus: userStatusDto.licenseStatus === 'active',
                },
            ],
            actionType: ActionType.EDIT,
        });
    }
}
