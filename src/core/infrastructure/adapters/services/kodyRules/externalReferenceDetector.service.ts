import { Injectable } from '@nestjs/common';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { IKodyRuleExternalReference } from '@/core/domain/kodyRules/interfaces/kodyRules.interface';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { ObservabilityService } from '@/core/infrastructure/adapters/services/logger/observability.service';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { BYOKPromptRunnerService } from '@/shared/infrastructure/services/tokenTracking/byokPromptRunner.service';
import {
    LLMModelProvider,
    PromptRunnerService,
    ParserType,
    PromptRole,
    BYOKConfig,
} from '@kodus/kodus-common/llm';
import {
    prompt_kodyrules_detect_references_system,
    prompt_kodyrules_detect_references_user,
    kodyRulesDetectReferencesSchema,
    KodyRulesDetectReferencesSchema,
} from '@/shared/utils/langchainCommon/prompts/kodyRulesExternalReferences';

interface DetectReferencesParams {
    ruleText: string;
    repositoryId: string;
    repositoryName: string;
    organizationAndTeamData: OrganizationAndTeamData;
    byokConfig?: BYOKConfig;
}

@Injectable()
export class ExternalReferenceDetectorService {
    constructor(
        private readonly promptRunnerService: PromptRunnerService,
        private readonly observabilityService: ObservabilityService,
        private readonly codeManagementService: CodeManagementService,
        private readonly logger: PinoLoggerService,
    ) {}

    async detectAndResolveReferences(
        params: DetectReferencesParams,
    ): Promise<{
        references: IKodyRuleExternalReference[];
        syncError?: string;
    }> {
        try {
            const detectedReferences = await this.detectReferences(params);

            if (!detectedReferences || detectedReferences.length === 0) {
                return { references: [] };
            }

            const { references, notFoundFiles } =
                await this.searchFilesInRepository(
                    detectedReferences,
                    params.repositoryId,
                    params.repositoryName,
                    params.organizationAndTeamData,
                );

            const syncError =
                notFoundFiles.length > 0
                    ? `Unable to find referenced files: ${notFoundFiles.join(', ')}`
                    : undefined;

            return { references, syncError };
        } catch (error) {
            this.logger.error({
                message: 'Error detecting and resolving external references',
                context: ExternalReferenceDetectorService.name,
                error,
                metadata: {
                    repositoryId: params.repositoryId,
                    organizationAndTeamData: params.organizationAndTeamData,
                },
            });
            return {
                references: [],
                syncError: `Error during reference detection: ${error.message}`,
            };
        }
    }

    private async detectReferences(
        params: DetectReferencesParams,
    ): Promise<KodyRulesDetectReferencesSchema['references']> {
        const mainProvider = LLMModelProvider.GEMINI_2_5_FLASH;
        const fallbackProvider = LLMModelProvider.GEMINI_2_5_PRO;
        const runName = 'kodyRulesDetectExternalReferences';

        const promptRunner = new BYOKPromptRunnerService(
            this.promptRunnerService,
            mainProvider,
            fallbackProvider,
            params.byokConfig,
        );

        try {
            const { result: raw } =
                await this.observabilityService.runLLMInSpan({
                    spanName: `${ExternalReferenceDetectorService.name}::${runName}`,
                    runName,
                    attrs: {
                        repositoryId: params.repositoryId,
                        organizationId:
                            params.organizationAndTeamData.organizationId,
                        type: promptRunner.executeMode,
                        fallback: false,
                    },
                    exec: async (callbacks) => {
                        return await promptRunner
                            .builder()
                            .setParser(ParserType.STRING)
                            .setPayload({ rule: params.ruleText })
                            .addPrompt({
                                role: PromptRole.SYSTEM,
                                prompt: prompt_kodyrules_detect_references_system(),
                            })
                            .addPrompt({
                                role: PromptRole.USER,
                                prompt: prompt_kodyrules_detect_references_user(
                                    {
                                        rule: params.ruleText,
                                    },
                                ),
                            })
                            .addCallbacks(callbacks)
                            .addMetadata({ runName })
                            .setRunName(runName)
                            .execute();
                    },
                });

            if (!raw) {
                return [];
            }

            const parsed = this.extractJsonArray(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }

            this.logger.log({
                message: 'Successfully detected external references',
                context: ExternalReferenceDetectorService.name,
                metadata: {
                    repositoryId: params.repositoryId,
                    referencesCount: parsed.length,
                },
            });

            return parsed;
        } catch (error) {
            this.logger.error({
                message: 'Error calling LLM for reference detection',
                context: ExternalReferenceDetectorService.name,
                error,
                metadata: {
                    repositoryId: params.repositoryId,
                    organizationAndTeamData: params.organizationAndTeamData,
                },
            });
            return [];
        }
    }

    private async searchFilesInRepository(
        detectedReferences: KodyRulesDetectReferencesSchema['references'],
        repositoryId: string,
        repositoryName: string,
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<{
        references: IKodyRuleExternalReference[];
        notFoundFiles: string[];
    }> {
        const resolvedReferences: IKodyRuleExternalReference[] = [];
        const notFoundFiles: string[] = [];

        for (const ref of detectedReferences) {
            try {
                const found = await this.findFileWithHybridStrategy(
                    ref,
                    repositoryId,
                    repositoryName,
                    organizationAndTeamData,
                );

                if (found.length > 0) {
                    resolvedReferences.push(...found);

                    this.logger.log({
                        message: 'Resolved external reference',
                        context: ExternalReferenceDetectorService.name,
                        metadata: {
                            fileName: ref.fileName,
                            filesFound: found.length,
                            paths: found.map((r) => r.filePath),
                            repositoryName: ref.repositoryName,
                            crossRepo: !!ref.repositoryName,
                        },
                    });
                } else {
                    const fileIdentifier = ref.repositoryName
                        ? `${ref.repositoryName}/${ref.fileName}`
                        : ref.fileName;
                    notFoundFiles.push(fileIdentifier);

                    this.logger.warn({
                        message: 'No files found for external reference',
                        context: ExternalReferenceDetectorService.name,
                        metadata: {
                            fileName: ref.fileName,
                            repositoryName: ref.repositoryName,
                            crossRepo: !!ref.repositoryName,
                        },
                    });
                }
            } catch (error) {
                this.logger.error({
                    message: 'Error searching for external reference file',
                    context: ExternalReferenceDetectorService.name,
                    error,
                    metadata: {
                        reference: ref,
                        repositoryId,
                        repositoryName: ref.repositoryName,
                        crossRepo: !!ref.repositoryName,
                    },
                });
            }
        }

        return { references: resolvedReferences, notFoundFiles };
    }

    private async findFileWithHybridStrategy(
        ref: KodyRulesDetectReferencesSchema['references'][0],
        repositoryId: string,
        repositoryName: string,
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<IKodyRuleExternalReference[]> {
        const filePatterns = this.buildSearchPatterns(ref);

        return await this.searchWithPatterns(
            filePatterns,
            repositoryId,
            repositoryName,
            organizationAndTeamData,
            ref,
        );
    }

    private buildSearchPatterns(
        ref: KodyRulesDetectReferencesSchema['references'][0],
    ): string[] {
        const patterns: string[] = [];

        if (ref.filePattern) {
            patterns.push(ref.filePattern);
        }

        patterns.push(`**/${ref.fileName}`);

        return [...new Set(patterns)];
    }

    private async searchWithPatterns(
        filePatterns: string[],
        repositoryId: string,
        repositoryName: string,
        organizationAndTeamData: OrganizationAndTeamData,
        ref: KodyRulesDetectReferencesSchema['references'][0],
    ): Promise<IKodyRuleExternalReference[]> {
        try {
            const targetRepoName = ref.repositoryName || repositoryName;
            const targetRepo = {
                id: repositoryId,
                name: targetRepoName,
            };

            this.logger.log({
                message: 'Searching for external reference file',
                context: ExternalReferenceDetectorService.name,
                metadata: {
                    filePatterns,
                    targetRepository: targetRepo,
                    crossRepo: !!ref.repositoryName,
                },
            });

            const files =
                await this.codeManagementService.getRepositoryAllFiles({
                    organizationAndTeamData,
                    repository: targetRepo,
                    filters: {
                        filePatterns,
                        maxFiles: 10,
                    },
                });

            if (files && files.length > 0) {
                return files.map((file) => ({
                    filePath: file.path,
                    description: ref.description,
                    ...(ref.repositoryName && {
                        repositoryName: ref.repositoryName,
                    }),
                }));
            }
        } catch (error) {
            this.logger.warn({
                message: 'Pattern search failed for external reference',
                context: ExternalReferenceDetectorService.name,
                error,
                metadata: {
                    filePatterns,
                    repositoryName: ref.repositoryName,
                    crossRepo: !!ref.repositoryName,
                },
            });
        }

        return [];
    }

    private extractJsonArray(text: string | null | undefined): any[] | null {
        if (!text || typeof text !== 'string') return null;
        let s = text.trim();
        const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenceMatch && fenceMatch[1]) s = fenceMatch[1].trim();
        if (s.startsWith('"') && s.endsWith('"')) {
            try {
                s = JSON.parse(s);
            } catch {}
        }
        const start = s.indexOf('[');
        const end = s.lastIndexOf(']');
        if (start >= 0 && end > start) s = s.slice(start, end + 1);
        try {
            const parsed = JSON.parse(s);
            return Array.isArray(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }
}
