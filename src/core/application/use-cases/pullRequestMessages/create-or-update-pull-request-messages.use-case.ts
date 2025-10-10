import { Inject, Injectable } from '@nestjs/common';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import {
    IPullRequestMessagesService,
    PULL_REQUEST_MESSAGES_SERVICE_TOKEN,
} from '@/core/domain/pullRequestMessages/contracts/pullRequestMessages.service.contract';
import { IPullRequestMessages } from '@/core/domain/pullRequestMessages/interfaces/pullRequestMessages.interface';
import { ConfigLevel } from '@/config/types/general/pullRequestMessages.type';
import { ActionType } from '@/config/types/general/codeReviewSettingsLog.type';
import {
    CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN,
    ICodeReviewSettingsLogService,
} from '@/ee/codeReviewSettingsLog/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.service.contract';

import { GetAdditionalInfoHelper } from '@/shared/utils/helpers/getAdditionalInfo.helper';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { PullRequestMessagesLogParams } from '@/ee/codeReviewSettingsLog/services/pullRequestMessageLog.handler';
import { IUser } from '@/core/domain/user/interfaces/user.interface';
import { AuthorizationService } from '@/core/infrastructure/adapters/services/permissions/authorization.service';
import {
    Action,
    ResourceType,
} from '@/core/domain/permissions/enums/permissions.enum';

@Injectable()
export class CreateOrUpdatePullRequestMessagesUseCase implements IUseCase {
    constructor(
        @Inject(PULL_REQUEST_MESSAGES_SERVICE_TOKEN)
        private readonly pullRequestMessagesService: IPullRequestMessagesService,

        @Inject(CODE_REVIEW_SETTINGS_LOG_SERVICE_TOKEN)
        private readonly codeReviewSettingsLogService: ICodeReviewSettingsLogService,

        private readonly getAdditionalInfoHelper: GetAdditionalInfoHelper,

        private readonly logger: PinoLoggerService,

        private readonly authorizationService: AuthorizationService,
    ) {}

    async execute(
        userInfo: Partial<IUser>,
        pullRequestMessages: IPullRequestMessages,
    ): Promise<void> {
        if (!userInfo?.organization?.uuid) {
            throw new Error('Organization ID is required in user info');
        }

        this.authorizationService.ensure({
            user: userInfo,
            action: Action.Create,
            resource: ResourceType.CodeReviewSettings,
            repoIds: [pullRequestMessages.repositoryId || 'global'],
        });

        pullRequestMessages.organizationId = userInfo?.organization?.uuid;

        if (pullRequestMessages?.configLevel === ConfigLevel.GLOBAL) {
            pullRequestMessages.repositoryId = 'global';
        }

        const existingPullRequestMessage = await this.findExistingConfiguration(
            pullRequestMessages.organizationId,
            pullRequestMessages.configLevel,
            pullRequestMessages.repositoryId,
            pullRequestMessages.directoryId,
        );

        const isUpdate = !!existingPullRequestMessage;

        if (isUpdate) {
            await this.pullRequestMessagesService.update(pullRequestMessages);
        } else {
            await this.pullRequestMessagesService.create(pullRequestMessages);
        }

        try {
            const logParams: PullRequestMessagesLogParams = {
                organizationAndTeamData: {
                    organizationId: pullRequestMessages.organizationId,
                },
                userInfo: {
                    userId: userInfo?.uuid,
                    userEmail: userInfo?.email,
                },
                actionType: ActionType.EDIT,
                configLevel: pullRequestMessages.configLevel,
                repositoryId: pullRequestMessages.repositoryId,
                directoryId: pullRequestMessages.directoryId,
                startReviewMessage: pullRequestMessages.startReviewMessage,
                endReviewMessage: pullRequestMessages.endReviewMessage,
                existingStartMessage:
                    existingPullRequestMessage?.startReviewMessage,
                existingEndMessage:
                    existingPullRequestMessage?.endReviewMessage,
                directoryPath:
                    (await this.getAdditionalInfoHelper.getDirectoryPathByOrganizationAndRepository(
                        pullRequestMessages.organizationId,
                        pullRequestMessages.repositoryId,
                        pullRequestMessages.directoryId,
                    )) || '',
                isUpdate,
            };
            await this.codeReviewSettingsLogService.registerPullRequestMessagesLog(
                logParams,
            );

            return;
        } catch (error) {
            this.logger.error({
                message: 'Error registering pull request messages log',
                context: CreateOrUpdatePullRequestMessagesUseCase.name,
                error,
                metadata: {
                    organizationId: pullRequestMessages.organizationId,
                    configLevel: pullRequestMessages.configLevel,
                    repositoryId: pullRequestMessages.repositoryId,
                    directoryId: pullRequestMessages.directoryId,
                },
            });
            return;
        }
    }

    private async findExistingConfiguration(
        organizationId: string,
        configLevel: ConfigLevel,
        repositoryId?: string,
        directoryId?: string,
    ): Promise<IPullRequestMessages | null> {
        const searchCriteria: any = {
            organizationId,
            configLevel,
        };

        if (
            repositoryId &&
            (configLevel === ConfigLevel.REPOSITORY ||
                configLevel === ConfigLevel.DIRECTORY)
        ) {
            searchCriteria.repositoryId = repositoryId;
        }

        if (configLevel === ConfigLevel.DIRECTORY && directoryId) {
            searchCriteria.directoryId = directoryId;
        }

        return await this.pullRequestMessagesService.findOne(searchCriteria);
    }
}
