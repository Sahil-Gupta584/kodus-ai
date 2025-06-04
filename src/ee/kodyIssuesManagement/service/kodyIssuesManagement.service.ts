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
    }): Promise<void> {
        try {
            this.logger.log({
                message: `Starting issue processing for closed PR#${params.prNumber}`,
                context: KodyIssuesManagementService.name,
                metadata: params,
            });

            // 1. Buscar suggestions não implementadas do PR
            const allSuggestions = await this.getAllSuggestionsFromPr(
                params.organizationId,
                params.prNumber,
            );

            // 2. Agrupar por arquivo
            const suggestionsByFile = this.groupSuggestionsByFile(
                allSuggestions,
            );

            // 3. Para cada arquivo, fazer merge com issues existentes
            const changedFiles = Object.keys(suggestionsByFile);

            for (const filePath of changedFiles) {
                await this.mergeSuggestionsIntoIssues(
                    params.organizationId,
                    params.repositoryId,
                    filePath,
                    suggestionsByFile[filePath],
                );
            }

            // 4. Resolver issues que podem ter sido corrigidas
            await this.resolveExistingIssues(
                params.organizationId,
                params.repositoryId,
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

            if (!existingIssues) {
                // Se não há issues existentes, todas as suggestions são novas
                await this.createNewIssues(
                    organizationId,
                    repositoryId,
                    newSuggestions,
                );
                return;
            }

            // 2. Preparar dados para o prompt
            const promptData = {
                filePath,
                existingIssues: existingIssues
                    ? {
                          issueId: existingIssues.uuid,
                          representativeSuggestion:
                              existingIssues.representativeSuggestion,
                      }
                    : null,
                newSuggestions: newSuggestions.map((suggestion) => ({
                    id: suggestion.id,
                    language: suggestion.language,
                    relevantFile: suggestion.relevantFile,
                    suggestionContent: suggestion.suggestionContent,
                    existingCode: suggestion.existingCode,
                    improvedCode: suggestion.improvedCode,
                    oneSentenceSummary: suggestion.oneSentenceSummary,
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
        unmatchedSuggestions: any[],
    ): Promise<void> {
        // TODO: Implementar depois
        for (const suggestion of unmatchedSuggestions) {
            await this.issuesService.create({
                title:
                    suggestion.oneSentenceSummary ||
                    `Issue in ${suggestion.relevantFile}`,
                description: suggestion.suggestionContent,
                filePath: suggestion.relevantFile,
                language: suggestion.language,
                representativeSuggestion: suggestion,
                contributingSuggestionIds: [suggestion.id],
                repositoryId,
                organizationId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }
    }

    async resolveExistingIssues(
        organizationId: string,
        repositoryId: string,
        changedFiles: string[],
    ): Promise<void> {
        // TODO: Implementar depois
        this.logger.log({
            message: 'Resolving existing issues - TODO',
            context: KodyIssuesManagementService.name,
        });
    }

    private async getAllSuggestionsFromPr(
        organizationId: string,
        prNumber: number,
    ): Promise<any[]> {
        // Buscar PR com todas as suggestions
        const pr = await this.pullRequestsService.findOne({
            organizationId,
            number: prNumber,
        });

        if (!pr?.files) {
            return [];
        }

        const discardedStatuses = [
            PriorityStatus.DISCARDED_BY_SAFEGUARD,
            PriorityStatus.DISCARDED_BY_KODY_FINE_TUNING,
            PriorityStatus.DISCARDED_BY_CODE_DIFF,
        ];

        return pr.files.reduce((acc: any[], file) => {
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

    private groupSuggestionsByFile(suggestions: any[]) {
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
        mergeResult: any,
        newSuggestions: any[],
    ): Promise<void> {
        if (!mergeResult?.matches) {
            return;
        }

        const unmatchedSuggestions: any[] = [];

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
                unmatchedSuggestions,
            );
        }
    }
}
