import {
    IIssuesService,
    ISSUES_SERVICE_TOKEN,
} from '@/core/domain/issues/contracts/issues.service.contract';
import { IUseCase } from '@/shared/domain/interfaces/use-case.interface';
import { Inject, Injectable } from '@nestjs/common';
import { BuildFilterUseCase } from './build-filter.use-case';
import { IssuesEntity } from '@/core/domain/issues/entities/issues.entity';
import { CODE_REVIEW_FEEDBACK_SERVICE_TOKEN, ICodeReviewFeedbackService } from '@/core/domain/codeReviewFeedback/contracts/codeReviewFeedback.service.contract';
import { IIssue } from '@/core/domain/issues/interfaces/issues.interface';

@Injectable()
export class GetIssueByIdUseCase implements IUseCase {
    constructor(
        @Inject(ISSUES_SERVICE_TOKEN)
        private readonly issuesService: IIssuesService,

        @Inject(CODE_REVIEW_FEEDBACK_SERVICE_TOKEN)
        private readonly codeReviewFeedbackService: ICodeReviewFeedbackService,

        private readonly buildFilterUseCase: BuildFilterUseCase,
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

        const prNumbers = await this.selectAllPrNumbers(issue);

        const issueWithFeedback = {
            ...issue.toObject(),
            reactions: issueFeedbacks.map((feedback) => feedback.reactions),
            prNumbers,
        };

        return issueWithFeedback;
    }

    private async selectAllPrNumbers(issue: IssuesEntity): Promise<string[]> {
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

        const orderedPrNumbers = new Set(
            Array.from(prNumbers).sort((a, b) => parseInt(a) - parseInt(b)),
        );

        return Array.from(orderedPrNumbers);
    }
}
