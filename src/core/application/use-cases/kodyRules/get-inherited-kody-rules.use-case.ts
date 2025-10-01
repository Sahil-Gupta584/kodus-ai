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
        excludedRules: Partial<KodyRuleWithInheritance>[];
        allRules: Partial<KodyRuleWithInheritance>[];
    }> {
        if (!repositoryId || repositoryId === 'global') {
            return {
                globalRules: [],
                repoRules: [],
                directoryRules: [],
                excludedRules: [],
                allRules: [],
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
                excludedRules: [],
                allRules: [],
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
        excludedRules: Partial<KodyRuleWithInheritance>[];
        allRules: Partial<KodyRuleWithInheritance>[];
    } {
        const globalRules = [];
        const repoRules = [];
        const directoryRules = [];
        const excludedRules = [];

        for (const rule of rules) {
            if (
                rule.inheritance?.exclude?.includes(directoryId || repositoryId)
            ) {
                excludedRules.push({
                    ...rule,
                    inherited:
                        rule.repositoryId === 'global'
                            ? 'global'
                            : rule.directoryId
                              ? 'directory'
                              : 'repository',
                });
                continue;
            }

            if (rule.repositoryId === 'global' && !rule.directoryId) {
                globalRules.push({
                    ...rule,
                    inherited: 'global',
                });
            } else if (
                rule.repositoryId === repositoryId &&
                !rule.directoryId
            ) {
                repoRules.push({
                    ...rule,
                    inherited: 'repository',
                });
            } else if (rule.directoryId && rule.directoryId !== directoryId) {
                directoryRules.push({
                    ...rule,
                    inherited: 'directory',
                });
            }
        }

        return {
            globalRules,
            repoRules,
            directoryRules,
            excludedRules,
            allRules: [
                ...globalRules,
                ...repoRules,
                ...directoryRules,
                ...excludedRules,
            ],
        };
    }
}
