import { Inject, Injectable } from '@nestjs/common';
import { ICodeReviewSettingsLogService } from '@/ee/codeReviewSettingsLog/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.service.contract';
import {
    CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN,
    ICodeReviewSettingsLogRepository,
} from '@/ee/codeReviewSettingsLog/domain/codeReviewSettingsLog/contracts/codeReviewSettingsLog.repository.contract';
import { CodeReviewSettingsLogEntity } from '@/ee/codeReviewSettingsLog/domain/codeReviewSettingsLog/entities/codeReviewSettingsLog.entity';
import { ICodeReviewSettingsLog } from '@/ee/codeReviewSettingsLog/domain/codeReviewSettingsLog/interfaces/codeReviewSettingsLog.interface';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { PermissionValidationService } from '@/ee/shared/services/permissionValidation.service';

// Handlers
import { KodyRuleLogParams, KodyRulesLogHandler } from './kodyRulesLog.handler';
import {
    CodeReviewConfigLogHandler,
    CodeReviewConfigLogParams,
} from './codeReviewConfigLog.handler';
import {
    RepositoriesLogHandler,
    RepositoriesLogParams,
    RepositoryConfigRemovalParams,
    DirectoryConfigRemovalParams,
} from './repositoriesLog.handler';
import {
    IntegrationLogHandler,
    IntegrationLogParams,
} from './integrationLog.handler';
import {
    UserStatusLogHandler,
    UserStatusLogParams,
} from './userStatusLog.handler';
import {
    PullRequestMessagesLogHandler,
    PullRequestMessagesLogParams,
} from './pullRequestMessageLog.handler';

@Injectable()
export class CodeReviewSettingsLogService
    implements ICodeReviewSettingsLogService
{
    constructor(
        @Inject(CODE_REVIEW_SETTINGS_LOG_REPOSITORY_TOKEN)
        private readonly codeReviewSettingsLogRepository: ICodeReviewSettingsLogRepository,

        private readonly permissionValidationService: PermissionValidationService,
        private readonly kodyRulesLogHandler: KodyRulesLogHandler,
        private readonly codeReviewConfigLogHandler: CodeReviewConfigLogHandler,
        private readonly repositoriesLogHandler: RepositoriesLogHandler,
        private readonly integrationLogHandler: IntegrationLogHandler,
        private readonly userStatusLogHandler: UserStatusLogHandler,
        private readonly pullRequestMessagesLogHandler: PullRequestMessagesLogHandler,
    ) {}

    /**
     * Verifica se a organização tem permissão para usar audit logs (feature enterprise)
     * Audit logs só estão disponíveis para planos MANAGED/ENTERPRISE
     * NÃO disponível para: FREE, BYOK, Self-hosted
     */
    private async shouldAllowAuditLogs(
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<boolean> {
        const shouldLimit =
            await this.permissionValidationService.shouldLimitResources(
                organizationAndTeamData,
                CodeReviewSettingsLogService.name,
            );

        // Se limita recursos (FREE/BYOK/sem licença) = NÃO permite audit logs
        // Se NÃO limita (MANAGED/ENTERPRISE) = PERMITE audit logs
        return !shouldLimit;
    }

    async create(
        codeReviewSettingsLog: Omit<ICodeReviewSettingsLog, 'uuid'>,
    ): Promise<CodeReviewSettingsLogEntity> {
        return this.codeReviewSettingsLogRepository.create(
            codeReviewSettingsLog,
        );
    }

    async find(
        filter?: Partial<ICodeReviewSettingsLog>,
    ): Promise<CodeReviewSettingsLogEntity[]> {
        return this.codeReviewSettingsLogRepository.find(filter);
    }

    // Kody Rules
    public async registerKodyRulesLog(
        params: KodyRuleLogParams,
    ): Promise<void> {
        const canAudit = await this.shouldAllowAuditLogs(
            params.organizationAndTeamData,
        );
        if (!canAudit) {
            return;
        }

        await this.kodyRulesLogHandler.logKodyRuleAction(params);
    }

    // Code Review Config
    public async registerCodeReviewConfigLog(
        params: CodeReviewConfigLogParams,
    ): Promise<void> {
        const canAudit = await this.shouldAllowAuditLogs(
            params.organizationAndTeamData,
        );
        if (!canAudit) {
            return;
        }

        await this.codeReviewConfigLogHandler.logCodeReviewConfig(params);
    }

    // Repositories
    public async registerRepositoriesLog(
        params: RepositoriesLogParams,
    ): Promise<void> {
        const canAudit = await this.shouldAllowAuditLogs(
            params.organizationAndTeamData,
        );
        if (!canAudit) {
            return;
        }

        await this.repositoriesLogHandler.logRepositoriesAction(params);
    }

    public async registerRepositoryConfigurationRemoval(
        params: RepositoryConfigRemovalParams,
    ): Promise<void> {
        const canAudit = await this.shouldAllowAuditLogs(
            params.organizationAndTeamData,
        );
        if (!canAudit) {
            return;
        }

        await this.repositoriesLogHandler.logRepositoryConfigurationRemoval(
            params,
        );
    }

    public async registerDirectoryConfigurationRemoval(
        params: DirectoryConfigRemovalParams,
    ): Promise<void> {
        const canAudit = await this.shouldAllowAuditLogs(
            params.organizationAndTeamData,
        );
        if (!canAudit) {
            return;
        }

        await this.repositoriesLogHandler.logDirectoryConfigurationRemoval(
            params,
        );
    }

    // Integrations
    public async registerIntegrationLog(
        params: IntegrationLogParams,
    ): Promise<void> {
        const canAudit = await this.shouldAllowAuditLogs(
            params.organizationAndTeamData,
        );
        if (!canAudit) {
            return;
        }

        await this.integrationLogHandler.logIntegrationAction(params);
    }

    // User Status
    public async registerUserStatusLog(
        params: UserStatusLogParams,
    ): Promise<void> {
        const canAudit = await this.shouldAllowAuditLogs(
            params.organizationAndTeamData,
        );
        if (!canAudit) {
            return;
        }

        await this.userStatusLogHandler.logUserStatusChanges(params);
    }

    // Pull Request Messages
    public async registerPullRequestMessagesLog(
        params: PullRequestMessagesLogParams,
    ): Promise<void> {
        const canAudit = await this.shouldAllowAuditLogs(
            params.organizationAndTeamData,
        );
        if (!canAudit) {
            return;
        }

        await this.pullRequestMessagesLogHandler.logPullRequestMessagesAction(
            params,
        );
    }
}
