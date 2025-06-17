import {
    IIssuesService,
    ISSUES_SERVICE_TOKEN,
} from '@/core/domain/issues/contracts/issues.service.contract';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Inject, Injectable } from '@nestjs/common';
import { IssuesEntity } from '@/core/domain/issues/entities/issues.entity';
import {
    CODE_REVIEW_FEEDBACK_SERVICE_TOKEN,
    ICodeReviewFeedbackService,
} from '@/core/domain/codeReviewFeedback/contracts/codeReviewFeedback.service.contract';
import {
    IIssue,
    IIssueDetails,
} from '@/core/domain/issues/interfaces/issues.interface';
import { PlatformType } from '@/shared/domain/enums/platform-type.enum';

@Injectable()
export class GetIssueByIdUseCase implements IUseCase {
    constructor(
        @Inject(ISSUES_SERVICE_TOKEN)
        private readonly issuesService: IIssuesService,

        @Inject(CODE_REVIEW_FEEDBACK_SERVICE_TOKEN)
        private readonly codeReviewFeedbackService: ICodeReviewFeedbackService,
    ) {}

    async execute(id: string): Promise<IIssueDetails | null> {
        const issue = await this.issuesService.findById(id);

        if (!issue) {
            return null;
        }

        const codeReviewFeedback =
            await this.codeReviewFeedbackService.getByOrganizationId(
                issue.organizationId,
            );

        const reactions = await this.calculateTotalReactions(
            issue,
            codeReviewFeedback,
        );
        const prUrls = await this.selectAllPrNumbers(issue);

        const dataToBuildUrls = {
            platform: issue.repository.platform,
            repositoryName: issue.repository.name,
            repositoryFullName: issue.repository.full_name,
        };

        return {
            title: issue.title,
            description: issue.description,
            age: await this.ageCalculation(issue),
            label: issue.label,
            severity: issue.severity,
            status: issue.status,
            fileLink: {
                label: issue.filePath,
                url: this.buildFileUrl(dataToBuildUrls, issue.filePath),
            },
            prLinks: prUrls.map((pr) => ({
                label: pr.number,
                url: pr.url,
            })),
            repositoryLink: {
                label: issue.repository.name,
                url: this.buildRepositoryUrl(dataToBuildUrls),
            },
            currentCode: issue.representativeSuggestion.existingCode,
            reactions,
        };
    }

    private async calculateTotalReactions(
        issue: IssuesEntity,
        codeReviewFeedback: any[],
    ): Promise<{ thumbsUp: number; thumbsDown: number }> {
        const suggestionIds = new Set<string>();

        if (issue.contributingSuggestions?.length) {
            issue.contributingSuggestions.forEach((suggestion) => {
                if (suggestion.id) {
                    suggestionIds.add(suggestion.id);
                }
            });
        }

        const allRelevantFeedbacks = codeReviewFeedback.filter(
            (feedback) =>
                feedback?.suggestionId &&
                suggestionIds.has(feedback.suggestionId),
        );

        let totalThumbsUp = 0;
        let totalThumbsDown = 0;

        allRelevantFeedbacks.forEach((feedback) => {
            if (feedback.reactions) {
                if (typeof feedback.reactions.thumbsUp === 'number') {
                    totalThumbsUp += feedback.reactions.thumbsUp;
                }
                if (typeof feedback.reactions.thumbsDown === 'number') {
                    totalThumbsDown += feedback.reactions.thumbsDown;
                }
            }
        });

        return {
            thumbsUp: totalThumbsUp,
            thumbsDown: totalThumbsDown,
        };
    }

    private async selectAllPrNumbers(issue: IssuesEntity): Promise<
        {
            number: string;
            url: string;
        }[]
    > {
        const prNumbers = new Set<string>();

        if (issue.contributingSuggestions?.length) {
            issue.contributingSuggestions.forEach((suggestion) => {
                if (suggestion.prNumber) {
                    prNumbers.add(suggestion.prNumber.toString());
                }
            });
        }

        const dataToBuildUrls = {
            platform: issue.repository.platform,
            repositoryName: issue.repository.name,
            repositoryFullName: issue.repository.full_name,
        };

        const repositoryUrl = this.buildRepositoryUrl(dataToBuildUrls);

        issue.repository.url = repositoryUrl;

        const orderedPrNumbers = Array.from(prNumbers).sort(
            (a, b) => parseInt(a) - parseInt(b),
        );

        return orderedPrNumbers.map((prNumber) => ({
            number: prNumber,
            url: this.buildPullRequestUrl(dataToBuildUrls, prNumber),
        }));
    }

    private buildFileUrl(
        data: {
            platform: PlatformType;
            repositoryName: string;
            repositoryFullName: string;
        },
        filePath: string,
        branch: string = 'main',
    ): string {
        // Remove barra inicial se existir
        const cleanFilePath = filePath.startsWith('/')
            ? filePath.substring(1)
            : filePath;

        switch (data.platform) {
            case PlatformType.GITHUB:
                return `https://github.com/${data.repositoryFullName}/blob/${branch}/${cleanFilePath}`;
            case PlatformType.GITLAB:
                return `https://gitlab.com/${data.repositoryFullName}/-/blob/${branch}/${cleanFilePath}`;
            case PlatformType.AZURE_REPOS:
                return `https://dev.azure.com/${data.repositoryFullName}/_git/${data.repositoryName}?path=/${cleanFilePath}`;
            case PlatformType.BITBUCKET:
                return `https://bitbucket.org/${data.repositoryFullName}/src/${branch}/${cleanFilePath}`;
            default:
                throw new Error(`Plataforma não suportada: ${data.platform}`);
        }
    }

    // ... existing code ...

    private buildPullRequestUrl(
        data: {
            platform: PlatformType;
            repositoryName: string;
            repositoryFullName: string;
        },
        prNumber: string,
    ): string {
        switch (data.platform) {
            case PlatformType.GITHUB:
                return `https://github.com/${data.repositoryFullName}/pull/${prNumber}`;
            case PlatformType.GITLAB:
                return `https://gitlab.com/${data.repositoryFullName}/-/merge_requests/${prNumber}`;
            case PlatformType.AZURE_REPOS:
                return `https://dev.azure.com/${data.repositoryFullName}/_git/${data.repositoryName}/pullrequest/${prNumber}`;
            case PlatformType.BITBUCKET:
                return `https://bitbucket.org/${data.repositoryFullName}/pull-requests/${prNumber}`;
            default:
                throw new Error(`Plataforma não suportada: ${data.platform}`);
        }
    }

    private buildRepositoryUrl(data: {
        platform: PlatformType;
        repositoryFullName: string;
    }): string {
        switch (data.platform) {
            case PlatformType.GITHUB:
                return `https://github.com/${data.repositoryFullName}`;
            case PlatformType.GITLAB:
                return `https://gitlab.com/${data.repositoryFullName}`;
            case PlatformType.AZURE_REPOS:
                return `https://dev.azure.com/${data.repositoryFullName}`;
            case PlatformType.BITBUCKET:
                return `https://bitbucket.org/${data.repositoryFullName}`;
            default:
                throw new Error(`Plataforma não suportada: ${data.platform}`);
        }
    }

    private async ageCalculation(issue: IssuesEntity): Promise<string> {
        const now = new Date();
        const createdAt = new Date(issue.createdAt);

        const diffTime = Math.abs(now.getTime() - createdAt.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const daysText = diffDays === 1 ? 'day' : 'days';

        return `${diffDays} ${daysText} ago`;
    }
}
