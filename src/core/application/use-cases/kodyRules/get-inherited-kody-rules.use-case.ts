import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import {
    CODE_BASE_CONFIG_SERVICE_TOKEN,
    ICodeBaseConfigService,
} from '@/core/domain/codeBase/contracts/CodeBaseConfigService.contract';
import {
    IKodyRulesService,
    KODY_RULES_SERVICE_TOKEN,
} from '@/core/domain/kodyRules/contracts/kodyRules.service.contract';
import {
    IKodyRule,
    KodyRulesStatus,
} from '@/core/domain/kodyRules/interfaces/kodyRules.interface';
import { KodyRulesValidationService } from '@/ee/kodyRules/service/kody-rules-validation.service';
import { Inject, Injectable } from '@nestjs/common';

type KodyRuleWithInheritance = Partial<IKodyRule> & {
    inherited?: 'global' | 'repository' | 'directory';
    excluded?: boolean;
};

@Injectable()
export class GetInheritedRulesKodyRulesUseCase {
    constructor(
        private readonly kodyRulesValidationService: KodyRulesValidationService,

        @Inject(CODE_BASE_CONFIG_SERVICE_TOKEN)
        private readonly codeBaseConfigService: ICodeBaseConfigService,

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

        const existing = await this.kodyRulesService.findOne({
            organizationId: organizationAndTeamData.organizationId,
        });

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

        const directoryConfig =
            await this.codeBaseConfigService.getDirectoryConfigs(
                organizationAndTeamData,
                { id: repositoryId, name: '' },
            );
        const directoryPath: string | null =
            directoryConfig?.repoConfig?.directories?.find(
                (dir) => dir.id === directoryId,
            )?.path || null;

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
