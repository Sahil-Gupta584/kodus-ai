import { Entity } from '@/shared/domain/interfaces/entity';
import { IIssue } from '../interfaces/issues.interface';


export class IssuesEntity implements Entity<IIssue> {
    public uuid?: string;
    public title: string;
    public description: string;
    public filePath: string;
    public language: string;
    public representativeSuggestion: any;
    public contributingSuggestionIds: string[];
    public createdAt: string;
    public updatedAt: string;

    constructor(issue: IIssue) {
        this.uuid = issue.uuid;
        this.title = issue.title;
        this.description = issue.description;
        this.filePath = issue.filePath;
        this.language = issue.language;
        this.representativeSuggestion = issue.representativeSuggestion;
        this.contributingSuggestionIds = issue.contributingSuggestionIds;
        this.createdAt = issue.createdAt;
        this.updatedAt = issue.updatedAt;
    }

    toJson(): IIssue {
        return {
            uuid: this.uuid,
            title: this.title,
            description: this.description,
            filePath: this.filePath,
            language: this.language,
            representativeSuggestion: this.representativeSuggestion,
            contributingSuggestionIds: this.contributingSuggestionIds,
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
            representativeSuggestion: this.representativeSuggestion,
            contributingSuggestionIds: this.contributingSuggestionIds,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}