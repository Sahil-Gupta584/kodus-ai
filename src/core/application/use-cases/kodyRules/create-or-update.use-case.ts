import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { KODY_RULES_SERVICE_TOKEN } from '@/core/domain/kodyRules/contracts/kodyRules.service.contract';
import { IKodyRulesService } from '@/core/domain/kodyRules/contracts/kodyRules.service.contract';
import {
    Action,
    ResourceType,
} from '@/core/domain/permissions/enums/permissions.enum';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { AuthorizationService } from '@/core/infrastructure/adapters/services/permissions/authorization.service';
import { CreateKodyRuleDto } from '@/core/infrastructure/http/dtos/create-kody-rule.dto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { ExternalReferenceDetectorService } from '@/core/infrastructure/adapters/services/kodyRules/externalReferenceDetector.service';
import { GetAdditionalInfoHelper } from '@/shared/utils/helpers/getAdditionalInfo.helper';

@Injectable()
export class CreateOrUpdateKodyRulesUseCase {
    constructor(
        @Inject(KODY_RULES_SERVICE_TOKEN)
        private readonly kodyRulesService: IKodyRulesService,

        private readonly logger: PinoLoggerService,

        @Inject(REQUEST)
        private readonly request: Request & {
            user: {
                organization: { uuid: string };
                uuid: string;
                email: string;
            };
        },

        private readonly authorizationService: AuthorizationService,
        private readonly externalReferenceDetectorService: ExternalReferenceDetectorService,
        private readonly getAdditionalInfoHelper: GetAdditionalInfoHelper,
    ) {}

    async execute(
        kodyRule: CreateKodyRuleDto,
        organizationId: string,
        userInfo?: { userId: string; userEmail: string },
    ) {
        try {
            const organizationAndTeamData: OrganizationAndTeamData = {
                organizationId,
            };

            const req: any = this.request as any;
            const reqUser = req?.user;
            const userInfoData =
                userInfo ||
                (reqUser?.uuid && reqUser?.email
                    ? { userId: reqUser.uuid, userEmail: reqUser.email }
                    : { userId: 'kody-system', userEmail: 'kody@kodus.io' });

            if (userInfoData.userId !== 'kody-system') {
                await this.authorizationService.ensure({
                    user: this.request.user,
                    action: Action.Create,
                    resource: ResourceType.KodyRules,
                    repoIds: kodyRule.repositoryId
                        ? [kodyRule.repositoryId]
                        : undefined,
                });
            }

            const result = await this.kodyRulesService.createOrUpdate(
                organizationAndTeamData,
                kodyRule,
                userInfoData,
            );

            if (!result) {
                throw new NotFoundException(
                    'Failed to create or update kody rule',
                );
            }

            if (result.uuid && kodyRule.repositoryId && kodyRule.rule) {
                this.detectAndSaveReferencesAsync(
                    result.uuid,
                    kodyRule.rule,
                    kodyRule.repositoryId,
                    organizationAndTeamData,
                ).catch((error) => {
                    this.logger.error({
                        message:
                            'Background reference detection failed completely',
                        context: CreateOrUpdateKodyRulesUseCase.name,
                        error,
                        metadata: {
                            ruleId: result.uuid,
                            ruleTitle: kodyRule.title,
                            organizationAndTeamData,
                        },
                    });
                });
            }

            return result;
        } catch (error) {
            this.logger.error({
                message: 'Could not create or update Kody rules',
                context: CreateOrUpdateKodyRulesUseCase.name,
                serviceName: 'CreateOrUpdateKodyRulesUseCase',
                error: error,
                metadata: {
                    kodyRule,
                    organizationAndTeamData: {
                        organizationId,
                    },
                },
            });
            throw error;
        }
    }

    private async detectAndSaveReferencesAsync(
        ruleId: string,
        ruleText: string,
        repositoryId: string,
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<void> {
        return new Promise((resolve) => {
            setImmediate(async () => {
                try {
                    let repositoryName: string;
                    try {
                        repositoryName =
                            await this.getAdditionalInfoHelper.getRepositoryNameByOrganizationAndRepository(
                                organizationAndTeamData.organizationId,
                                repositoryId,
                            );
                    } catch (error) {
                        this.logger.warn({
                            message:
                                'Failed to resolve repository name, using ID as fallback',
                            context: CreateOrUpdateKodyRulesUseCase.name,
                            error,
                            metadata: {
                                organizationAndTeamData,
                            },
                        });
                        repositoryName = repositoryId;
                    }

                    this.logger.log({
                        message:
                            'Starting background detection of external references',
                        context: CreateOrUpdateKodyRulesUseCase.name,
                        metadata: {
                            ruleId,
                            repositoryId,
                            repositoryName,
                            organizationAndTeamData,
                        },
                    });

                    const { references, syncError } =
                        await this.externalReferenceDetectorService.detectAndResolveReferences(
                            {
                                ruleText,
                                repositoryId,
                                repositoryName,
                                organizationAndTeamData,
                            },
                        );

                    await this.kodyRulesService.createOrUpdate(
                        organizationAndTeamData,
                        {
                            uuid: ruleId,
                            externalReferences:
                                references.length > 0 ? references : undefined,
                            syncError,
                        } as any,
                        {
                            userId: 'kody-bg-detector',
                            userEmail: 'kody@kodus.io',
                        },
                    );

                    if (syncError) {
                        this.logger.warn({
                            message: 'Rule updated with sync error',
                            context: CreateOrUpdateKodyRulesUseCase.name,
                            metadata: {
                                ruleId,
                                syncError,
                                organizationAndTeamData,
                            },
                        });
                    } else if (references.length > 0) {
                        this.logger.log({
                            message:
                                'Successfully updated rule with detected external references',
                            context: CreateOrUpdateKodyRulesUseCase.name,
                            metadata: {
                                ruleId,
                                referencesCount: references.length,
                                paths: references.map((r) => r.filePath),
                                organizationAndTeamData,
                            },
                        });
                    } else {
                        this.logger.log({
                            message: 'No external references detected for rule',
                            context: CreateOrUpdateKodyRulesUseCase.name,
                            metadata: {
                                ruleId,
                                organizationAndTeamData,
                            },
                        });
                    }
                } catch (error) {
                    this.logger.warn({
                        message:
                            'Failed to detect external references in background',
                        context: CreateOrUpdateKodyRulesUseCase.name,
                        error,
                        metadata: {
                            ruleId,
                            repositoryId,
                            organizationAndTeamData,
                        },
                    });
                }
                resolve();
            });
        });
    }
}
