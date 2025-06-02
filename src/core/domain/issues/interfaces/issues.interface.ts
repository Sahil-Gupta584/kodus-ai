import { ISuggestion } from '@/core/domain/pullRequests/interfaces/pullRequests.interface';

export interface IIssue {
    uuid?: string;
    title: string;
    description: string;
    filePath: string;
    language: string;
    representativeSuggestion: ISuggestion;
    contributingSuggestionIds: string[];
    createdAt: string;
    updatedAt: string;
}
