import { Injectable, Inject } from '@nestjs/common';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { PULL_REQUESTS_SERVICE_TOKEN } from '@/core/domain/pullRequests/contracts/pullRequests.service.contracts';
import { IPullRequestsService } from '@/core/domain/pullRequests/contracts/pullRequests.service.contracts';
import { ImplementationStatus } from '@/core/domain/pullRequests/enums/implementationStatus.enum';
import { ISSUES_SERVICE_TOKEN } from '@/core/domain/issues/contracts/issues.service.contract';
import { IKodyIssuesManagementService } from '@/core/domain/codeBase/contracts/KodyIssuesManagement.contract';
import { IssuesService } from '@/core/infrastructure/adapters/services/issues/issues.service';
import { KodyIssuesAnalysisService } from '@/ee/codeBase/kodyIssuesAnalysis.service';
import { KODY_ISSUES_ANALYSIS_SERVICE_TOKEN } from '@/ee/codeBase/kodyIssuesAnalysis.service';
import { PriorityStatus } from '@/core/domain/pullRequests/enums/priorityStatus.enum';
import { IssueStatus } from '@/config/types/general/issues.type';
import { CodeSuggestion } from '@/config/types/general/codeReview.type';

@Injectable()
export class KodyIssuesManagementService
    implements IKodyIssuesManagementService
{
    constructor(
        private readonly logger: PinoLoggerService,

        @Inject(ISSUES_SERVICE_TOKEN)
        private readonly issuesService: IssuesService,

        @Inject(PULL_REQUESTS_SERVICE_TOKEN)
        private readonly pullRequestsService: IPullRequestsService,

        @Inject(KODY_ISSUES_ANALYSIS_SERVICE_TOKEN)
        private readonly kodyIssuesAnalysisService: KodyIssuesAnalysisService,
    ) {}

    async processClosedPr(params: {
        prNumber: number;
        organizationId: string;
        repositoryId: string;
        repositoryName: string;
        prFiles: any[];
    }): Promise<void> {
        try {
            this.logger.log({
                message: `Starting issue processing for closed PR#${params.prNumber}`,
                context: KodyIssuesManagementService.name,
                metadata: params,
            });

            // 1. Buscar suggestions não implementadas do PR
            const allSuggestions =
                await this.filterValidSuggestionsFromPrByStatus(params.prFiles);

            if (allSuggestions.length === 0) {
                this.logger.log({
                    message: `No suggestions found for PR#${params.prNumber}`,
                    context: KodyIssuesManagementService.name,
                    metadata: params,
                });
                return;
            }

            // 2. Agrupar por arquivo
            const suggestionsByFile =
                this.groupSuggestionsByFile(allSuggestions);

            // 3. Para cada arquivo, fazer merge com issues existentes
            const changedFiles = Object.keys(suggestionsByFile);

            for (const filePath of changedFiles) {
                await this.mergeSuggestionsIntoIssues(
                    params.organizationId,
                    params.repositoryId,
                    params.repositoryName,
                    params.prNumber,
                    filePath,
                    suggestionsByFile[filePath],
                );
            }

            // 4. Resolver issues que podem ter sido corrigidas
            await this.resolveExistingIssues(
                params.organizationId,
                params.repositoryId,
                params.prFiles,
                changedFiles,
            );
        } catch (error) {
            this.logger.error({
                message: `Error processing closed PR#${params.prNumber}`,
                context: KodyIssuesManagementService.name,
                error,
                metadata: params,
            });
            throw error;
        }
    }

    async mergeSuggestionsIntoIssues(
        organizationId: string,
        repositoryId: string,
        repositoryName: string,
        prNumber: number,
        filePath: string,
        newSuggestions: any[],
    ): Promise<any> {
        try {
            // 1. Buscar issues abertas para o arquivo
            const existingIssues = await this.issuesService.findByFileAndStatus(
                organizationId,
                repositoryId,
                filePath,
                IssueStatus.OPEN,
            );

            if (!existingIssues || existingIssues?.length === 0) {
                // Se não há issues existentes, todas as suggestions são novas
                await this.createNewIssues(
                    organizationId,
                    repositoryId,
                    repositoryName,
                    prNumber,
                    newSuggestions,
                );
                return;
            }

            // 2. Preparar dados para o prompt (com array de issues)
            const promptData = {
                filePath,
                existingIssues: existingIssues.map((issue) => ({
                    issueId: issue.uuid,
                    representativeSuggestion: issue.representativeSuggestion,
                })),
                newSuggestions: newSuggestions.map((suggestion) => ({
                    id: suggestion.id,
                    language: suggestion.language,
                    relevantFile: suggestion.relevantFile,
                    suggestionContent: suggestion.suggestionContent,
                    existingCode: suggestion.existingCode,
                    improvedCode: suggestion.improvedCode,
                    oneSentenceSummary: suggestion.oneSentenceSummary,
                    severity: suggestion.severity,
                    label: suggestion.label,
                })),
            };

            // 3. Chamar LLM para fazer o merge
            const mergeResult =
                await this.kodyIssuesAnalysisService.mergeSuggestionsIntoIssues(
                    organizationId,
                    promptData,
                );

            // 4. Processar resultado do merge
            await this.processMergeResult(
                organizationId,
                repositoryId,
                repositoryName,
                prNumber,
                mergeResult,
                newSuggestions,
            );
        } catch (error) {
            this.logger.error({
                message: `Error merging suggestions into issues for file ${filePath}`,
                context: KodyIssuesManagementService.name,
                error,
                metadata: { organizationId, repositoryId, filePath },
            });
            throw error;
        }
    }

    async createNewIssues(
        organizationId: string,
        repositoryId: string,
        repositoryName: string,
        prNumber: number,
        unmatchedSuggestions: Partial<CodeSuggestion>[],
    ): Promise<void> {
        try {
            const suggestionsByFile =
                this.groupSuggestionsByFile(unmatchedSuggestions);

            for (const [filePath, suggestions] of Object.entries(
                suggestionsByFile,
            )) {
                const promptData = {
                    filePath,
                    unmatchedSuggestions: (
                        suggestions as Partial<CodeSuggestion>[]
                    ).map((suggestion: Partial<CodeSuggestion>) => ({
                        id: suggestion.id,
                        language: suggestion.language,
                        relevantFile: suggestion.relevantFile,
                        suggestionContent: suggestion.suggestionContent,
                        existingCode: suggestion.existingCode,
                        improvedCode: suggestion.improvedCode,
                        oneSentenceSummary: suggestion.oneSentenceSummary,
                    })),
                };

                const llmResult =
                    await this.kodyIssuesAnalysisService.createNewIssues(
                        organizationId,
                        promptData,
                    );

                if (llmResult?.newlyFormedIssues) {
                    for (const newIssue of llmResult.newlyFormedIssues) {
                        const representativeSuggestion =
                            this.findSuggestionById(
                                unmatchedSuggestions,
                                newIssue.representativeSuggestion.id,
                            );

                        await this.issuesService.create({
                            title: newIssue.title,
                            description: newIssue.description,
                            filePath: newIssue.filePath,
                            language: newIssue.language,
                            label: representativeSuggestion?.label || 'unknown',
                            severity:
                                representativeSuggestion?.severity || 'medium',
                            representativeSuggestion:
                                newIssue.representativeSuggestion,
                            contributingSuggestions:
                                newIssue.contributingSuggestionIds.map(
                                    (suggestionId) => ({
                                        id: suggestionId,
                                        prNumber: prNumber,
                                    }),
                                ),
                            status: IssueStatus.OPEN,
                            repository: {
                                id: repositoryId,
                                name: repositoryName,
                            },
                            organizationId,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        });
                    }

                    await this.pullRequestsService.updateSyncedWithIssuesFlag(
                        prNumber,
                        repositoryId,
                        organizationId,
                        true,
                    );
                }
            }
        } catch (error) {
            this.logger.error({
                message: 'Error creating new issues',
                context: KodyIssuesManagementService.name,
                error,
                metadata: { organizationId, repositoryId },
            });
            throw error;
        }
    }

    async resolveExistingIssues(
        organizationId: string,
        repositoryId: string,
        files: any[],
        changedFiles: string[],
    ): Promise<void> {
        try {
            for (const filePath of changedFiles) {
                const fileData = files.find((f) => f.path === filePath);
                if (!fileData) continue;

                // Buscar issues abertas para o arquivo
                const openIssues = await this.issuesService.findByFileAndStatus(
                    organizationId,
                    repositoryId,
                    filePath,
                    IssueStatus.OPEN,
                );

                if (!openIssues.length) continue;

                // Construir conteúdo do arquivo (usando patch como aproximação)
                const currentCode =
                    this.extractCodeFromPatch(fileData.patch) ||
                    'Content not available';

                const promptData = {
                    filePath,
                    language: fileData.suggestions?.[0]?.language || 'unknown',
                    currentCode,
                    issues: openIssues.map((issue) => ({
                        issueId: issue.uuid,
                        title: issue.title,
                        description: issue.description,
                        representativeSuggestion:
                            issue.representativeSuggestion,
                        contributingSuggestionIds:
                            issue.contributingSuggestions?.map(
                                (suggestion) => suggestion.id,
                            ),
                    })),
                };

                const llmResult =
                    await this.kodyIssuesAnalysisService.resolveExistingIssues(
                        organizationId,
                        promptData,
                    );

                if (llmResult?.issueVerificationResults) {
                    for (const resolution of llmResult.issueVerificationResults) {
                        if (!resolution.isIssuePresentInCode) {
                            await this.issuesService.updateStatus(
                                resolution.issueId,
                                IssueStatus.RESOLVED,
                            );
                        }
                    }
                }
            }
        } catch (error) {
            this.logger.error({
                message: 'Error resolving existing issues',
                context: KodyIssuesManagementService.name,
                error,
                metadata: { organizationId, repositoryId },
            });
            throw error;
        }
    }

    private extractCodeFromPatch(patch: string): string {
        if (!patch) return '';

        // Extrai linhas que não começam com - (removidas)
        return patch
            .split('\n')
            .filter((line) => !line.startsWith('-') && !line.startsWith('@@'))
            .map((line) => (line.startsWith('+') ? line.substring(1) : line))
            .join('\n');
    }
    private findSuggestionById(
        unmatchedSuggestions: any[],
        suggestionId: string,
    ) {
        return unmatchedSuggestions.find(
            (suggestion) => suggestion.id === suggestionId,
        );
    }

    private async filterValidSuggestionsFromPrByStatus(
        prFiles: any[],
    ): Promise<any[]> {
        const discardedStatuses = [
            PriorityStatus.DISCARDED_BY_SAFEGUARD,
            PriorityStatus.DISCARDED_BY_KODY_FINE_TUNING,
            PriorityStatus.DISCARDED_BY_CODE_DIFF,
        ];

        return prFiles.reduce((acc: any[], file) => {
            const validSuggestions = (file.suggestions || [])
                .filter((suggestion) => {
                    // Deve ser não implementada
                    const isNotImplemented =
                        suggestion.implementationStatus ===
                        ImplementationStatus.NOT_IMPLEMENTED;

                    // Não deve estar descartada pelos status específicos
                    const isNotDiscarded = !discardedStatuses.includes(
                        suggestion.priorityStatus,
                    );

                    return isNotImplemented && isNotDiscarded;
                })
                .map((suggestion) => ({
                    ...suggestion,
                    relevantFile: file.path,
                }));

            return [...acc, ...validSuggestions];
        }, []);
    }

    private groupSuggestionsByFile(suggestions: Partial<CodeSuggestion>[]) {
        return suggestions.reduce((acc, suggestion) => {
            const filePath = suggestion.relevantFile;
            if (!acc[filePath]) {
                acc[filePath] = [];
            }
            acc[filePath].push(suggestion);
            return acc;
        }, {});
    }

    private async processMergeResult(
        organizationId: string,
        repositoryId: string,
        repositoryName: string,
        prNumber: number,
        mergeResult: any,
        newSuggestions: Partial<CodeSuggestion>[],
    ): Promise<void> {
        if (!mergeResult?.matches) {
            return;
        }

        const unmatchedSuggestions: Partial<CodeSuggestion>[] = [];

        for (const match of mergeResult.matches) {
            const suggestion = newSuggestions.find(
                (s) => s.id === match.suggestionId,
            );

            if (!suggestion) continue;

            if (match.existingIssueId) {
                // Adicionar suggestion à issue existente
                const existingIssue = await this.issuesService.findById(
                    match.existingIssueId,
                );
                if (existingIssue) {
                    await this.issuesService.addSuggestionIds(
                        match.existingIssueId,
                        [suggestion.id],
                    );
                }
            } else {
                // Suggestion não tem match, vai para novas issues
                unmatchedSuggestions.push(suggestion);
            }
        }

        // Criar novas issues para suggestions não matcheadas
        if (unmatchedSuggestions.length > 0) {
            await this.createNewIssues(
                organizationId,
                repositoryId,
                repositoryName,
                prNumber,
                unmatchedSuggestions,
            );
        }
    }
}
