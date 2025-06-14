import { Injectable, Inject } from '@nestjs/common';
import { ISSUES_REPOSITORY_TOKEN } from '@/core/domain/issues/contracts/issues.repository';
import { IIssuesRepository } from '@/core/domain/issues/contracts/issues.repository';
import { IssuesEntity } from '@/core/domain/issues/entities/issues.entity';
import { IIssue } from '@/core/domain/issues/interfaces/issues.interface';
import { IIssuesService } from '@/core/domain/issues/contracts/issues.service.contract';
import { IssueStatus } from '@/config/types/general/issues.type';
import {
    CODE_REVIEW_FEEDBACK_SERVICE_TOKEN,
    ICodeReviewFeedbackService,
} from '@/core/domain/codeReviewFeedback/contracts/codeReviewFeedback.service.contract';

@Injectable()
export class IssuesService implements IIssuesService {
    constructor(
        @Inject(ISSUES_REPOSITORY_TOKEN)
        private readonly issuesRepository: IIssuesRepository,

        @Inject(CODE_REVIEW_FEEDBACK_SERVICE_TOKEN)
        private readonly codeReviewFeedbackService: ICodeReviewFeedbackService,
    ) {}

    getNativeCollection() {
        return this.issuesRepository.getNativeCollection();
    }

    async create(issue: Omit<IIssue, 'uuid'>): Promise<IssuesEntity> {
        return this.issuesRepository.create(issue);
    }

    //#region Find
    async findByFileAndStatus(
        organizationId: string,
        repositoryId: string,
        filePath: string,
        status?: IssueStatus,
    ): Promise<IssuesEntity[] | null> {
        return this.issuesRepository.findByFileAndStatus(
            organizationId,
            repositoryId,
            filePath,
            status,
        );
    }
    async findById(uuid: string): Promise<any | null> {
        const issue = await this.issuesRepository.findById(uuid);

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

    async findOne(filter?: Partial<IIssue>): Promise<IssuesEntity | null> {
        return this.issuesRepository.findOne(filter);
    }

    async find(
        filter?: any,
        options?: {
            limit?: number;
            skip?: number;
            sort?: any;
        },
    ): Promise<IssuesEntity[]> {
        return await this.issuesRepository.find(filter, options);
    }

    async count(filter?: any): Promise<number> {
        return await this.issuesRepository.count(filter);
    }
    //#endregion

    async update(
        issue: IssuesEntity,
        updateData: Partial<IIssue>,
    ): Promise<IssuesEntity | null> {
        return this.issuesRepository.update(issue, updateData);
    }

    async updateStatus(
        uuid: string,
        status: 'open' | 'resolved' | 'dismissed',
    ): Promise<IssuesEntity | null> {
        return this.issuesRepository.updateStatus(uuid, status);
    }

    async addSuggestionIds(
        uuid: string,
        suggestionIds: string[],
    ): Promise<IssuesEntity | null> {
        return this.issuesRepository.addSuggestionIds(uuid, suggestionIds);
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
