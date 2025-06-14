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
import { IIssue } from '@/core/domain/issues/interfaces/issues.interface';
import { PlatformType } from '@/shared/domain/enums/platform-type.enum';

@Injectable()
export class GetIssueByIdUseCase implements IUseCase {
    constructor(
        @Inject(ISSUES_SERVICE_TOKEN)
        private readonly issuesService: IIssuesService,

        @Inject(CODE_REVIEW_FEEDBACK_SERVICE_TOKEN)
        private readonly codeReviewFeedbackService: ICodeReviewFeedbackService,
    ) {}

    async execute(id: string): Promise<IIssue | null> {
        const issue = await this.issuesService.findById(id);

        if (!issue) {
            return null;
        }

        const codeReviewFeedback =
            await this.codeReviewFeedbackService.getByOrganizationId(
                issue.organizationId,
            );

        if (!codeReviewFeedback) {
            return issue;
        }

        const issueFeedbacks = codeReviewFeedback.filter(
            (feedback) =>
                feedback?.suggestionId === issue.representativeSuggestion.id,
        );

        const prLinks = await this.selectAllPrNumbers(issue);

        const issueWithFeedback = {
            ...issue.toObject(),
            reactions: issueFeedbacks.map((feedback) => feedback.reactions),
            prLinks,
        };

        return issueWithFeedback;
    }

    private async selectAllPrNumbers(issue: IssuesEntity): Promise<
        {
            number: string;
            url: string;
        }[]
    > {
        const prNumbers = new Set<string>();

        if (issue.representativeSuggestion?.prNumber) {
            prNumbers.add(issue.representativeSuggestion.prNumber.toString());
        }

        if (issue.contributingSuggestions?.length) {
            issue.contributingSuggestions.forEach((suggestion) => {
                if (suggestion.prNumber) {
                    prNumbers.add(suggestion.prNumber.toString());
                }
            });
        }

        const dataToBuildUrl = {
            platform: issue.repository.platform,
            repositoryName: issue.repository.name,
            repositoryFullName: issue.repository.full_name,
        };

        const orderedPrNumbers = Array.from(prNumbers).sort(
            (a, b) => parseInt(a) - parseInt(b),
        );

        return orderedPrNumbers.map((prNumber) => ({
            number: prNumber,
            url: this.buildUrl(dataToBuildUrl, prNumber),
        }));
    }

    private buildUrl(
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
}
