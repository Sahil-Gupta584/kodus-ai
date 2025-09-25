import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import {
    IJiraService,
    JIRA_SERVICE_TOKEN,
} from '@/core/domain/jira/contracts/jira.service.contract';
import {
    IOrganizationParametersRepository,
    ORGANIZATION_PARAMETERS_REPOSITORY_TOKEN,
} from '@/core/domain/organizationParameters/contracts/organizationParameters.repository.contract';
import { IOrganizationParametersService } from '@/core/domain/organizationParameters/contracts/organizationParameters.service.contract';
import { OrganizationParametersEntity } from '@/core/domain/organizationParameters/entities/organizationParameters.entity';
import { IOrganizationParameters } from '@/core/domain/organizationParameters/interfaces/organizationParameters.interface';
import { OrganizationParametersKey } from '@/shared/domain/enums/organization-parameters-key.enum';
import { safelyParseMessageContent } from '@/shared/utils/safelyParseMessageContent';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PromptService } from './prompt.service';
import { PinoLoggerService } from './logger/pino.service';
import { LLMProviderService, LLMModelProvider } from '@kodus/kodus-common/llm';

@Injectable()
export class OrganizationParametersService
    implements IOrganizationParametersService
{
    constructor(
        @Inject(ORGANIZATION_PARAMETERS_REPOSITORY_TOKEN)
        private readonly organizationParametersRepository: IOrganizationParametersRepository,

        @Inject(JIRA_SERVICE_TOKEN)
        private readonly jiraService: IJiraService,

        private readonly promptService: PromptService,

        private readonly llmProviderService: LLMProviderService,

        private readonly logger: PinoLoggerService,
    ) {}

    find(
        filter?: Partial<IOrganizationParameters>,
    ): Promise<OrganizationParametersEntity[]> {
        return this.organizationParametersRepository.find(filter);
    }

    findOne(
        filter?: Partial<IOrganizationParameters>,
    ): Promise<OrganizationParametersEntity> {
        return this.organizationParametersRepository.findOne(filter);
    }

    findByOrganizationName(
        organizationName: string,
    ): Promise<OrganizationParametersEntity> {
        return this.organizationParametersRepository.findByOrganizationName(
            organizationName,
        );
    }
    findById(uuid: string): Promise<OrganizationParametersEntity> {
        return this.organizationParametersRepository.findById(uuid);
    }

    create(
        parameters: IOrganizationParameters,
    ): Promise<OrganizationParametersEntity> {
        return this.organizationParametersRepository.create(parameters);
    }

    update(
        filter: Partial<IOrganizationParameters>,
        data: Partial<IOrganizationParameters>,
    ): Promise<OrganizationParametersEntity> {
        return this.organizationParametersRepository.update(filter, data);
    }

    delete(uuid: string): Promise<void> {
        return this.organizationParametersRepository.delete(uuid);
    }

    async findByKey(
        configKey: OrganizationParametersKey,
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<OrganizationParametersEntity> {
        return this.organizationParametersRepository.findByKey(
            configKey,
            organizationAndTeamData,
        );
    }

    async createOrUpdateConfig(
        organizationParametersKey: OrganizationParametersKey,
        configValue: any,
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<OrganizationParametersEntity | boolean> {
        try {
            const organizationParameters = await this.findOne({
                organization: { uuid: organizationAndTeamData.organizationId },
                configKey: organizationParametersKey,
            });

            if (!organizationParameters) {
                const uuid = uuidv4();

                return await this.create({
                    uuid: uuid,
                    configKey: organizationParametersKey,
                    configValue: configValue,
                    organization: {
                        uuid: organizationAndTeamData.organizationId,
                    },
                });
            } else {
                await this.update(
                    {
                        uuid: organizationParameters?.uuid,
                        organization: {
                            uuid: organizationAndTeamData.organizationId,
                        },
                    },
                    {
                        configKey: organizationParametersKey,
                        configValue: configValue,
                        organization: {
                            uuid: organizationAndTeamData.organizationId,
                        },
                    },
                );
                return true;
            }
        } catch (err) {
            throw new BadRequestException(err);
        }
    }

    async createOrUpdateWorkItemsConfig(
        organizationParametersKey: OrganizationParametersKey,
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<OrganizationParametersEntity> {
        try {
            const organizationParameters = await this.findOne({
                organization: { uuid: organizationAndTeamData.organizationId },
                configKey: organizationParametersKey,
            });

            const workItemsTypes = await this.jiraService.getWorkItemTypes({
                organizationAndTeamData,
            });

            if (!organizationParameters) {
                const uuid = uuidv4();

                const categorizedWorkItemTypes =
                    await this.categorizeWorkItemsTypes(
                        organizationAndTeamData,
                        workItemsTypes,
                    );

                return this.create({
                    uuid: uuid,
                    configKey: organizationParametersKey,
                    configValue: categorizedWorkItemTypes,
                    organization: {
                        uuid: organizationAndTeamData.organizationId,
                    },
                });
            } else {
                const categorizedWorkItemTypes =
                    await this.categorizeWorkItemsTypes(
                        organizationAndTeamData,
                        workItemsTypes,
                        organizationParameters.configValue,
                    );

                this.update(
                    {
                        uuid: organizationParameters?.uuid,
                        organization: {
                            uuid: organizationAndTeamData.organizationId,
                        },
                    },
                    {
                        configKey: organizationParametersKey,
                        configValue: categorizedWorkItemTypes,
                        organization: {
                            uuid: organizationAndTeamData.organizationId,
                        },
                    },
                );
            }
        } catch (err) {
            throw new BadRequestException(err);
        }
    }

    private async categorizeWorkItemsTypes(
        organizationAndTeamData: OrganizationAndTeamData,
        workItemsTypesToCategorize: any,
        categorizedWorkItemTypesParameter?: any,
    ) {
        const llm = await this.llmProviderService.getLLMProvider({
            model: LLMModelProvider.OPENAI_GPT_4O,
            temperature: 0,
        });

        let payload: any;

        payload = {
            typesOfWorkItemsAlreadyCategorized:
                categorizedWorkItemTypesParameter ?? null,
            workItemsTypesToCategorize: workItemsTypesToCategorize.map(
                (item) => ({ id: item.id, name: item.name }),
            ),
        };

        const prompt_categorizeWorkItemTypes =
            await this.promptService.getCompleteContextPromptByName(
                'prompt_categorizeWorkItemTypes',
                {
                    organizationAndTeamData,
                    promptIsForChat: false,
                    payload: payload,
                },
            );

        const categorizedWorkItemTypes = safelyParseMessageContent(
            (
                await llm.invoke(
                    await prompt_categorizeWorkItemTypes.format({
                        organizationAndTeamData,
                        promptIsForChat: false,
                        payload: payload,
                    }),
                    {
                        metadata: {
                            submodule: 'CategorizeWorkItemTypes',
                            module: 'CategorizedWorkItemsTypes',
                            teamId: organizationAndTeamData.teamId,
                        },
                    },
                )
            ).content,
        );

        return categorizedWorkItemTypes;
    }

    findByKeyAndValue(filter: {
        configKey: OrganizationParametersKey;
        configValue: any;
        organizationAndTeamData?: OrganizationAndTeamData;
        fuzzy?: boolean;
    }): Promise<OrganizationParametersEntity[]> {
        return this.organizationParametersRepository.findByKeyAndValue(filter);
    }

    async deleteByokConfig(
        organizationId: string,
        configType: 'main' | 'fallback',
    ): Promise<boolean> {
        try {
            // Primeiro, buscar a configuração atual
            const organizationAndTeamData = { organizationId };
            const currentConfig = await this.findByKey(
                OrganizationParametersKey.BYOK_CONFIG,
                organizationAndTeamData,
            );

            if (!currentConfig || !currentConfig.configValue) {
                throw new BadRequestException(
                    'BYOK configuration not found',
                );
            }

            const configValue = currentConfig.configValue;

            if (!configValue[configType]) {
                throw new BadRequestException(
                    `config ${configType} not found`,
                );
            }

            // Se for para deletar main e não houver fallback, ou deletar fallback quando só existe fallback
            if (configType === 'main' && !configValue.fallback) {
                // delete the entire configuration if there is only main
                await this.organizationParametersRepository.delete(
                    currentConfig.uuid,
                );
                return true;
            }

            // Criar nova configuração sem a parte deletada
            const newConfigValue = { ...configValue };
            delete newConfigValue[configType];

            // Atualizar no repository
            const updatedConfig =
                await this.organizationParametersRepository.update(
                    { uuid: currentConfig.uuid },
                    { configValue: newConfigValue },
                );

            return !!updatedConfig;
        } catch (err) {
            throw new BadRequestException(err);
        }
    }
}
