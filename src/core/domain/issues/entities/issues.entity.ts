import { Entity } from '@/shared/domain/interfaces/entity';
import { IIssue } from '../interfaces/issues.interface';
import { LabelType } from '@/shared/utils/codeManagement/labels';
import { SeverityLevel } from '@/shared/utils/enums/severityLevel.enum';
import { IssueStatus } from '@/config/types/general/issues.type';


export class IssuesEntity implements Entity<IIssue> {
    public uuid?: string;
    public title: string;
    public description: string;
    public filePath: string;
    public language: string;
    public label: LabelType;
    public severity: SeverityLevel;
    public representativeSuggestion: any;
    public contributingSuggestionIds: string[];
    public status: IssueStatus;
    public repositoryId: string;
    public organizationId: string;
    public createdAt: string;
    public updatedAt: string;

    constructor(issue: IIssue) {
        this.uuid = issue.uuid;
        this.title = issue.title;
        this.description = issue.description;
        this.filePath = issue.filePath;
        this.language = issue.language;
        this.label = issue.label;
        this.severity = issue.severity;
        this.representativeSuggestion = issue.representativeSuggestion;
        this.contributingSuggestionIds = issue.contributingSuggestionIds;
        this.status = issue.status;
        this.repositoryId = issue.repositoryId;
        this.organizationId = issue.organizationId;
        this.createdAt = issue.createdAt;
        this.updatedAt = issue.updatedAt;
    }

    public static create(issue: IIssue): IssuesEntity {
        return new IssuesEntity(issue);
    }

    toJson(): IIssue {
        return {
            uuid: this.uuid,
            title: this.title,
            description: this.description,
            filePath: this.filePath,
            language: this.language,
            label: this.label,
            severity: this.severity,
            representativeSuggestion: this.representativeSuggestion,
            contributingSuggestionIds: this.contributingSuggestionIds,
            status: this.status,
            repositoryId: this.repositoryId,
            organizationId: this.organizationId,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }

    toObject(): IIssue {
        return {
            uuid: this.uuid,
            title: this.title,
            description: this.description,
            filePath: this.filePath,
            language: this.language,
            label: this.label,
            severity: this.severity,
            representativeSuggestion: this.representativeSuggestion,
            contributingSuggestionIds: this.contributingSuggestionIds,
            status: this.status,
            repositoryId: this.repositoryId,
            organizationId: this.organizationId,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}