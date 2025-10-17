import { Inject, Injectable } from '@nestjs/common';
import {
    IParametersService,
    PARAMETERS_SERVICE_TOKEN,
} from '@/core/domain/parameters/contracts/parameters.service.contract';
import { ParametersEntity } from '@/core/domain/parameters/entities/parameters.entity';
import { ParametersKey } from '@/shared/domain/enums/parameters-key.enum';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';
import { REQUEST } from '@nestjs/core';
import { AuthorizationService } from '@/core/infrastructure/adapters/services/permissions/authorization.service';
import {
    Action,
    ResourceType,
} from '@/core/domain/permissions/enums/permissions.enum';
import { UpdateOrCreateIssuesParameterBodyDto } from '@/core/infrastructure/http/dtos/create-or-update-issues-parameter.dto';
import { IssueCreationConfig } from '@/core/domain/issues/entities/issue-creation-config.entity';

interface IssuesParameterBody {
    organizationAndTeamData: OrganizationAndTeamData;
    configValue: any;
    repositoryId?: string;
    directoryId?: string;
}

@Injectable()
export class UpdateOrCreateIssuesParameterUseCase {
    constructor(
        @Inject(PARAMETERS_SERVICE_TOKEN)
        private readonly parametersService: IParametersService,

        @Inject(REQUEST)
        private readonly request: Request & {
            user: {
                organization: { uuid: string };
                uuid: string;
                email: string;
            };
        },

        private readonly logger: PinoLoggerService,

        private readonly authorizationService: AuthorizationService,
    ) {}

    async execute(
        body: UpdateOrCreateIssuesParameterBodyDto,
    ): Promise<ParametersEntity<ParametersKey.ISSUE_CREATION_CONFIG> | boolean> {
        try {
            const { organizationAndTeamData, configValue } = body;
            const { organizationId, teamId } = organizationAndTeamData;
            await this.authorizationService.ensure({
                user: this.request.user,
                action: Action.Create,
                resource: ResourceType.IssuesSettings,
            });

            const issuesConfig = await this.parametersService.findByKey(
                ParametersKey.ISSUE_CREATION_CONFIG,
                { organizationId, teamId },
            );

            if (!issuesConfig) {
                const defaultIssueParameterConfig = {
                    automaticCreationEnabled: true,
                    sourceFilters: {
                        includeKodyRules: true,
                        includeCodeReviewEngine: true,
                    },
                    severityFilters: {
                        minimumSeverity: SeverityLevel.MEDIUM,
                        allowedSeverities: [
                            SeverityLevel.MEDIUM,
                            SeverityLevel.HIGH,
                        ],
                    },
                    organizationId,
                    teamId,
                };

                const finalConfig: IssueCreationConfig = {
                    ...defaultIssueParameterConfig,
                    ...(configValue || {}),
                };

                return await this.parametersService.createOrUpdateConfig(
                    ParametersKey.ISSUE_CREATION_CONFIG,
                    finalConfig,
                    { organizationId, teamId },
                );
            }
            return await this.parametersService.createOrUpdateConfig(
                ParametersKey.ISSUE_CREATION_CONFIG,
                configValue,
                { organizationId, teamId },
            );
        } catch (error) {
            this.logger.error({
                message: 'Error creating or updating issues parameter',
                context: UpdateOrCreateIssuesParameterUseCase.name,
                error: error,
                metadata: {
                    parametersKey: ParametersKey.ISSUE_CREATION_CONFIG,
                    organizationId: body.organizationAndTeamData.organizationId,
                    teamId: body.organizationAndTeamData.teamId,
                },
            });
            throw new Error('Error creating or updating issues parameters');
        }
    }
}
