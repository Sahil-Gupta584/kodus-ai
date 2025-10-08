import { DeepPartial } from 'typeorm';
import {
    CodeReviewConfigWithoutLLMProvider,
    KodusConfigFile,
} from './codeReview.type';
import { ErrorObject } from 'ajv';

export interface GetKodusConfigFileResponse {
    kodusConfigFile: Omit<KodusConfigFile, 'version'> | null;
    validationErrors: ErrorObject<string, Record<string, any>, unknown>[];
    isDeprecated?: boolean;
}

export type ICodeRepository = {
    avatar_url?: string;
    default_branch: string;
    http_url: string;
    id: string;
    language: string;
    name: string;
    organizationName: string;
    selected: string;
    visibility: 'private' | 'public';
    directories: Array<any>;
};

export type CodeReviewParameterBaseConfig = {
    id: string;
    name: string;
    isSelected: boolean;
    configs: DeepPartial<CodeReviewConfigWithoutLLMProvider>;
};

export type CodeReviewParameter = CodeReviewParameterBaseConfig & {
    repositories?: Array<RepositoryCodeReviewConfig>;
};

export type RepositoryCodeReviewConfig = CodeReviewParameterBaseConfig & {
    directories?: Array<DirectoryCodeReviewConfig>;
};

export type DirectoryCodeReviewConfig = CodeReviewParameterBaseConfig & {
    path: string;
};
