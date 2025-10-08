import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import {
    IKodyRulesService,
    KODY_RULES_SERVICE_TOKEN,
} from '@/core/domain/kodyRules/contracts/kodyRules.service.contract';
import {
    IKodyRule,
    KodyRulesStatus,
} from '@/core/domain/kodyRules/interfaces/kodyRules.interface';
import {
    IParametersService,
    PARAMETERS_SERVICE_TOKEN,
} from '@/core/domain/parameters/contracts/parameters.service.contract';
import { KodyRulesValidationService } from '@/ee/kodyRules/service/kody-rules-validation.service';
import { ParametersKey } from '@/shared/domain/enums/parameters-key.enum';
import { Inject, Injectable } from '@nestjs/common';

type KodyRuleWithInheritance = Partial<IKodyRule> & {
    inherited?: 'global' | 'repository' | 'directory';
    excluded?: boolean;
};

@Injectable()
export class GetInheritedRulesKodyRulesUseCase {
    constructor(
        private readonly kodyRulesValidationService: KodyRulesValidationService,

        @Inject(PARAMETERS_SERVICE_TOKEN)
        private readonly parametersService: IParametersService,

        @Inject(KODY_RULES_SERVICE_TOKEN)
        private readonly kodyRulesService: IKodyRulesService,
    ) {}

    async execute(
        organizationAndTeamData: OrganizationAndTeamData,
        repositoryId: string,
        directoryId?: string,
    ): Promise<{
        globalRules: Partial<KodyRuleWithInheritance>[];
        repoRules: Partial<KodyRuleWithInheritance>[];
        directoryRules: Partial<KodyRuleWithInheritance>[];
    }> {
        if (!repositoryId || repositoryId === 'global') {
            return {
                globalRules: [],
                repoRules: [],
                directoryRules: [],
            };
        }

        const existing = await this.kodyRulesService.findByOrganizationId(
            organizationAndTeamData.organizationId,
        );

        if (!existing) {
            return {
                globalRules: [],
                repoRules: [],
                directoryRules: [],
            };
        }

        const allRules =
            existing.rules?.filter(
                (r) => r.status === KodyRulesStatus.ACTIVE,
            ) || [];

        const parameter = await this.parametersService.findByKey(
            ParametersKey.CODE_REVIEW_CONFIG,
            organizationAndTeamData,
        );

        const repoConfig = parameter?.configValue?.repositories?.find(
            (repo) => repo.id === repositoryId,
        );

        const directoryConfig = repoConfig?.directories?.find(
            (dir) => dir.id === directoryId,
        );

        const directoryPath = directoryConfig?.path || null;

        const rulesForPath =
            this.kodyRulesValidationService.getKodyRulesForFile(
                directoryPath,
                allRules,
                {
                    directoryId,
                    repositoryId,
                    useExclude: false,
                    useInclude: false,
                },
            );

        const rulesWithOrigins = this.setRuleOrigins(
            rulesForPath,
            repositoryId,
            directoryId,
        );

        return rulesWithOrigins;
    }

    private setRuleOrigins(
        rules: Partial<IKodyRule>[],
        repositoryId: string,
        directoryId?: string,
    ): {
        globalRules: Partial<KodyRuleWithInheritance>[];
        repoRules: Partial<KodyRuleWithInheritance>[];
        directoryRules: Partial<KodyRuleWithInheritance>[];
    } {
        const globalRules = [];
        const repoRules = [];
        const directoryRules = [];

        for (const rule of rules) {
            const excluded = rule.inheritance?.exclude?.includes(
                directoryId || repositoryId,
            );

            if (rule.repositoryId === 'global') {
                // it comes from global rules
                globalRules.push({
                    ...rule,
                    inherited: 'global',
                    excluded,
                });
            } else if (
                rule.repositoryId === repositoryId &&
                !rule.directoryId
            ) {
                // it comes from repository rules
                repoRules.push({
                    ...rule,
                    inherited: 'repository',
                    excluded,
                });
            } else if (
                rule.repositoryId === repositoryId &&
                rule.directoryId &&
                rule.directoryId !== directoryId
            ) {
                // it comes from another directory rules
                directoryRules.push({
                    ...rule,
                    inherited: 'directory',
                    excluded,
                });
            }
        }

        return {
            globalRules,
            repoRules,
            directoryRules,
        };
    }
}
