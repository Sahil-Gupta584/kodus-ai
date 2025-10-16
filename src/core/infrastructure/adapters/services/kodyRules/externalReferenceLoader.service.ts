import { Injectable } from '@nestjs/common';
import { IKodyRule } from '@/core/domain/kodyRules/interfaces/kodyRules.interface';
import { AnalysisContext } from '@/config/types/general/codeReview.type';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';

export interface LoadedReference {
    filePath: string;
    content: string;
    description?: string;
}

@Injectable()
export class ExternalReferenceLoaderService {
    constructor(
        private readonly codeManagementService: CodeManagementService,
        private readonly logger: PinoLoggerService,
    ) {}

    async loadReferences(
        rule: IKodyRule,
        context: AnalysisContext,
    ): Promise<LoadedReference[]> {
        if (!rule.externalReferences || rule.externalReferences.length === 0) {
            return [];
        }

        const loadedReferences: LoadedReference[] = [];

        for (const ref of rule.externalReferences) {
            try {
                const fileContent =
                    await this.codeManagementService.getRepositoryContentFile({
                        organizationAndTeamData:
                            context.organizationAndTeamData,
                        repository: {
                            id: context.repository.id || '',
                            name: context.repository.name || '',
                        },
                        file: { filename: ref.filePath },
                        pullRequest: context.pullRequest,
                    });

                if (fileContent?.data?.content) {
                    let content = fileContent.data.content;

                    if (fileContent.data.encoding === 'base64') {
                        content = Buffer.from(content, 'base64').toString(
                            'utf-8',
                        );
                    }

                    loadedReferences.push({
                        filePath: ref.filePath,
                        content,
                        description: ref.description,
                    });

                    this.logger.log({
                        message: 'Successfully loaded external reference',
                        context: ExternalReferenceLoaderService.name,
                        metadata: {
                            filePath: ref.filePath,
                            ruleUuid: rule.uuid,
                            contentLength: content.length,
                            organizationAndTeamData:
                                context.organizationAndTeamData,
                        },
                    });
                } else {
                    this.logger.warn({
                        message:
                            'External reference file found but content is empty',
                        context: ExternalReferenceLoaderService.name,
                        metadata: {
                            filePath: ref.filePath,
                            ruleUuid: rule.uuid,
                        },
                    });
                }
            } catch (error) {
                this.logger.error({
                    message: 'Failed to load external reference file',
                    context: ExternalReferenceLoaderService.name,
                    error,
                    metadata: {
                        filePath: ref.filePath,
                        ruleUuid: rule.uuid,
                        repository: context.repository?.name,
                        pullRequest: context.pullRequest?.number,
                        organizationAndTeamData:
                            context.organizationAndTeamData,
                    },
                });
            }
        }

        return loadedReferences;
    }

    async loadReferencesForRules(
        rules: Partial<IKodyRule>[],
        context: AnalysisContext,
    ): Promise<Map<string, LoadedReference[]>> {
        const referencesMap = new Map<string, LoadedReference[]>();

        for (const rule of rules) {
            if (rule.uuid) {
                const loadedRefs = await this.loadReferences(
                    rule as IKodyRule,
                    context,
                );
                if (loadedRefs.length > 0) {
                    referencesMap.set(rule.uuid, loadedRefs);
                }
            }
        }

        const totalLoaded = Array.from(referencesMap.values()).reduce(
            (sum, refs) => sum + refs.length,
            0,
        );

        this.logger.log({
            message: 'Loaded external references for rules',
            context: ExternalReferenceLoaderService.name,
            metadata: {
                totalRules: rules.length,
                rulesWithReferences: referencesMap.size,
                totalReferencesLoaded: totalLoaded,
                organizationAndTeamData: context.organizationAndTeamData,
            },
        });

        return referencesMap;
    }
}
