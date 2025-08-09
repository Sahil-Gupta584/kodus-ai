import axios, { AxiosInstance } from 'axios';
import { Injectable } from '@nestjs/common';
import { AzureReposRepository } from '@/core/domain/azureRepos/entities/azureReposRepository.type';
import { AzureReposProject } from '@/core/domain/azureRepos/entities/azureReposProject.type';
import {
    AzurePRStatus,
    AzureRepoPullRequest,
} from '@/core/domain/azureRepos/entities/azureRepoPullRequest.type';
import {
    AzureRepoIteration,
    AzureRepoChange,
    AzureRepoCommit,
    AzureRepoFileContent,
    AzureRepoPRThread,
    AzureRepoSubscription,
    AzureRepoCommentType,
    AzureRepoReviewerWithVote,
} from '@/core/domain/azureRepos/entities/azureRepoExtras.type';
import { decrypt } from '@/shared/utils/crypto';
import { FileChange } from '@/config/types/general/codeReview.type';

@Injectable()
export class AzureReposRequestHelper {
    constructor() {}

    async getProjects(params: {
        orgName: string;
        token: string;
    }): Promise<AzureReposProject[]> {
        const instance = await this.azureRequest(params);
        const { data } = await instance.get('/_apis/projects?api-version=7.1');

        return data?.value;
    }

    /**
     * Obtém um projeto específico pelo seu ID
     */
    async getProject(params: {
        orgName: string;
        token: string;
        projectId: string;
    }): Promise<AzureReposProject> {
        const instance = await this.azureRequest(params);
        const { data } = await instance.get(
            `/_apis/projects/${params.projectId}?api-version=7.1`,
        );
        return data;
    }

    async getRepositories(params: {
        orgName: string;
        token: string;
        projectId: string;
    }): Promise<AzureReposRepository[]> {
        const instance = await this.azureRequest(params);
        const { data } = await instance.get(
            `/${params.projectId}/_apis/git/repositories?api-version=7.1`,
        );

        return data?.value;
    }

    async getPullRequestDetails(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        prId: number | string;
    }): Promise<AzureRepoPullRequest> {
        const instance = await this.azureRequest(params);
        const { data } = await instance.get(
            `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/pullrequests/${params.prId}?api-version=7.1`,
        );
        return data;
    }

    async getPullRequestsByRepo(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        startDate?: string;
        endDate?: string;
        status?: AzurePRStatus;
    }): Promise<AzureRepoPullRequest[]> {
        const instance = await this.azureRequest(params);

        const { status } = params;

        const searchStatus = status ?? AzurePRStatus.ALL;

        const { data } = await instance.get(
            `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/pullrequests?api-version=7.1&searchCriteria.status=${searchStatus}`,
        );

        const pullRequests = data?.value ?? [];

        if (pullRequests.length < 1 || (!params.startDate && !params.endDate)) {
            return pullRequests;
        }

        const start = params.startDate
            ? new Date(params.startDate).getTime()
            : null;
        const end = params.endDate ? new Date(params.endDate).getTime() : null;

        return pullRequests.filter((pr) => {
            const created = new Date(pr.creationDate).getTime();
            return (!start || created >= start) && (!end || created <= end);
        });
    }

    async getPullRequestComments(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        prId: number | string;
    }): Promise<AzureRepoPRThread[]> {
        const instance = await this.azureRequest(params);
        const { data } = await instance.get(
            `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/pullRequests/${params.prId}/threads?api-version=7.1`,
        );
        return data?.value ?? [];
    }

    async createReviewComment(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        prId: number | string;
        filePath: string;
        start_line: number;
        line: number;
        commentContent: string;
    }): Promise<AzureRepoPRThread> {
        const instance = await this.azureRequest(params);

        const isMultiLine =
            params.start_line !== undefined && params.start_line !== null;

        const payload = {
            comments: [
                {
                    content: params.commentContent,
                    commentType: AzureRepoCommentType.CODE,
                },
            ],
            status: 'active',
            threadContext: {
                filePath: params.filePath,
                rightFileStart: {
                    line: Math.max(
                        isMultiLine ? params.start_line! : params.line,
                        1,
                    ),
                    offset: 1,
                },
                rightFileEnd: {
                    line: Math.max(params.line, 1),
                    offset: 1,
                },
            },
        };

        const { data } = await instance.post(
            `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/pullRequests/${params.prId}/threads?api-version=7.1`,
            payload,
        );
        return data;
    }

    async getDefaultBranch(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
    }): Promise<string> {
        const instance = await this.azureRequest(params);
        const { data } = await instance.get(
            `/${params.projectId}/_apis/git/repositories/${params.repositoryId}?api-version=7.1`,
        );
        return data?.defaultBranch ?? '';
    }

    /**
     * Obtém um repositório específico pelo seu ID
     */
    async getRepository(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
    }): Promise<AzureReposRepository> {
        const instance = await this.azureRequest(params);
        const { data } = await instance.get(
            `/${params.projectId}/_apis/git/repositories/${params.repositoryId}?api-version=7.1`,
        );
        return data;
    }

    async completePullRequest(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        prId: number | string;
        completionOptions?: {
            deleteSourceBranch?: boolean;
            mergeStrategy?: string;
        };
    }): Promise<AzureRepoPullRequest> {
        const instance = await this.azureRequest(params);

        const updateData = {
            status: 'completed',
            completionOptions: params.completionOptions || {
                deleteSourceBranch: false,
                mergeStrategy: 'squash',
            },
        };

        const { data } = await instance.patch(
            `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/pullrequests/${params.prId}?api-version=7.1`,
            updateData,
        );

        return data;
    }

    async listSubscriptionsByProject(params: {
        orgName: string;
        token: string;
        projectId: string;
    }): Promise<AzureRepoSubscription[]> {
        const instance = await this.azureRequest(params);

        const res = await instance.get(
            '/_apis/hooks/subscriptions?api-version=7.1',
        );

        return res.data.value.filter(
            (sub) => sub.publisherInputs?.projectId === params.projectId,
        );
    }

    async findExistingWebhook(params: {
        orgName: string;
        token: string;
        projectId: string;
        eventType: string;
        repoId: string;
        url: string;
    }): Promise<AzureRepoSubscription | undefined> {
        const instance = await this.azureRequest(params);

        const { data } = await instance.get(
            '/_apis/hooks/subscriptions?api-version=7.1',
        );

        return data.value.find(
            (sub) =>
                sub.eventType === params.eventType &&
                sub.publisherInputs?.projectId === params.projectId &&
                sub.publisherInputs?.repository === params.repoId &&
                sub.consumerInputs?.url?.includes(params.url),
        );
    }

    async deleteWebhookById(params: {
        orgName: string;
        token: string;
        subscriptionId: string;
    }): Promise<void> {
        const instance = await this.azureRequest(params);

        await instance.delete(
            `/_apis/hooks/subscriptions/${params.subscriptionId}?api-version=7.1`,
        );
    }

    async createSubscriptionForProject(params: {
        orgName: string;
        token: string;
        projectId: string;
        subscriptionPayload: any;
    }): Promise<AzureRepoSubscription> {
        try {
            const instance = await this.azureRequest(params);

            const res = await instance.post(
                '/_apis/hooks/subscriptions?api-version=7.1',
                params.subscriptionPayload,
            );
            return res.data;
        } catch (error) {
            throw new Error(error);
        }
    }

    async getLanguageRepository(params: {
        orgName: string;
        token: string;
        projectId: string;
    }): Promise<any> {
        const instance = await this.azureRequest(params);

        const { data } = await instance.get(
            `/${params.projectId}/_apis/projectanalysis/languagemetrics?api-version=7.1-preview.1`,
        );

        return data;
    }

    async getAuthenticatedUserId(params: {
        orgName: string;
        token: string;
    }): Promise<string | null> {
        const { orgName, token } = params;

        const instance = await this.azureRequest({
            orgName,
            token,
            useGraphApi: true,
        });

        const { data } = await instance.get(
            '/_apis/connectionData?connectOptions=IncludeServices&api-version=7.1-preview',
        );

        return data?.authenticatedUser?.id;
    }

    private async azureRequest({
        orgName,
        token,
        useGraphApi = false,
    }: {
        orgName: string;
        token: string;
        useGraphApi?: boolean;
    }): Promise<AxiosInstance> {
        const baseURL = useGraphApi
            ? `https://vssps.dev.azure.com/${orgName}`
            : `https://dev.azure.com/${orgName}`;

        const instance = axios.create({
            baseURL,
            headers: {
                'Authorization': `Basic ${Buffer.from(`:${decrypt(token)}`).toString('base64')}`,
                'Content-Type': 'application/json',
            },
        });

        return instance;
    }

    async resolvePullRequestThread(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        prId: number;
        threadId: number;
    }): Promise<any> {
        const instance = await this.azureRequest(params);

        const url = `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/pullRequests/${params.prId}/threads/${params.threadId}?api-version=7.1`;

        const payload = { status: 'closed' };

        const { data } = await instance.patch(url, payload);

        return data;
    }

    async getIterations(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        prId: number | string;
    }): Promise<AzureRepoIteration[]> {
        const instance = await this.azureRequest(params);

        const { data } = await instance.get(
            `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/pullrequests/${params.prId}/iterations?api-version=7.1`,
        );

        return data?.value;
    }

    async getChanges(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        pullRequestId: number | string;
        iterationId: number | string;
    }): Promise<AzureRepoChange[]> {
        const instance = await this.azureRequest(params);
        let allChanges: AzureRepoChange[] = [];
        let skip = 0;
        let top = 100;

        while (true) {
            const { data } = await instance.get(
                `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/pullrequests/${params.pullRequestId}/iterations/${params.iterationId}/changes?api-version=7.1&$top=${top}&$skip=${skip}`,
            );

            const changeEntries = data?.changeEntries ?? [];
            allChanges = [...allChanges, ...changeEntries];

            if (data.nextSkip === undefined) {
                break;
            }

            if (data.nextTop !== undefined) {
                top = data.nextTop;
            }

            skip = data.nextSkip;
        }

        return allChanges;
    }

    async getCommits(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
    }): Promise<AzureRepoCommit[]> {
        const instance = await this.azureRequest(params);

        const { data } = await instance.get(
            `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/commits?api-version=7.1`,
        );
        return data?.value;
    }

    async getFileDiff(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        filePath: string;
        commitId: string;
        parentCommitId: string;
    }): Promise<any> {
        const instance = await this.azureRequest(params);

        const url = `/${params.projectId}/_apis/Contribution/HierarchyQuery/project/${params.projectId}?api-version=5.1-preview`;

        const body = {
            contributionIds: ['ms.vss-code-web.file-diff-data-provider'],
            dataProviderContext: {
                properties: {
                    repositoryId: params.repositoryId,
                    diffParameters: {
                        includeCharDiffs: true,
                        modifiedPath: params.filePath,
                        modifiedVersion: `GC${params.commitId}`,
                        originalPath: params.filePath,
                        originalVersion: `GC${params.parentCommitId}`,
                        partialDiff: true,
                    },
                },
            },
        };

        const { data } = await instance.post(url, body);
        return data;
    }

    async getFileContent(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        filePath: string;
        commitId: string;
    }): Promise<AzureRepoFileContent> {
        const instance = await this.azureRequest(params);

        try {
            // Primeira tentativa: usando a API items com versionDescriptor
            try {
                const { data } = await instance.get(
                    `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/items?path=${encodeURIComponent(
                        params.filePath,
                    )}&versionDescriptor.version=${params.commitId}&versionDescriptor.versionType=commit&includeContent=true&api-version=7.1`,
                );

                return data;
            } catch (initialError) {
                // Se a primeira tentativa falhar, tente a abordagem alternativa
                console.log(
                    `Primeira tentativa de obter arquivo falhou: ${initialError.message}. Tentando abordagem alternativa.`,
                );

                // Segunda tentativa: usando a URL diretamente
                // Remover a barra inicial no caminho do arquivo se existir
                const normalizedPath = params.filePath.startsWith('/')
                    ? params.filePath.substring(1)
                    : params.filePath;

                const { data } = await instance.get(
                    `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/items/${encodeURIComponent(
                        normalizedPath,
                    )}?version=${params.commitId}&versionType=commit&includeContent=true&api-version=7.1`,
                );
                return data;
            }
        } catch (error) {
            // Verificar se recebemos um erro 404 (arquivo não encontrado)
            if (error.response && error.response.status === 404) {
                throw new Error(
                    `Arquivo não encontrado: ${params.filePath} no commit ${params.commitId}`,
                );
            }

            // Verificar se é um erro de versão não encontrada
            if (
                error.response &&
                error.response.data &&
                error.response.data.message &&
                error.response.data.message.includes('TF401175')
            ) {
                throw new Error(
                    `O commit ${params.commitId} não pode ser encontrado no repositório ou você não tem permissão para acessá-lo.`,
                );
            }

            // Se for outro erro, repasse
            throw error;
        }
    }

    async getDiff(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        baseCommit: string;
        targetCommitId: string;
        filePath?: string;
    }): Promise<any[]> {
        const instance = await this.azureRequest(params);

        const queryParams = [
            `baseVersionType=commit`,
            `baseVersion=${params.baseCommit}`,
            `targetVersionType=commit`,
            `targetVersion=${params.targetCommitId}`,
            `api-version=7.1`,
        ];

        if (params.filePath) {
            queryParams.push(`path=${encodeURIComponent(params.filePath)}`);
        }

        const url = `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/diffs/commits?${queryParams.join('&')}`;

        try {
            const { data } = await instance.get(url);
            return data?.changes || [];
        } catch (error) {
            if (
                error.response?.data?.message?.includes('TF401175') ||
                error.response?.status === 404
            ) {
                throw new Error(
                    `Erro ao buscar diff para o arquivo '${params.filePath || 'ALL'}' entre ${params.baseCommit} e ${params.targetCommitId}.`,
                );
            }
            throw error;
        }
    }

    async getChangesForCommit(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        commitId: string;
    }): Promise<AzureRepoChange[]> {
        const instance = await this.azureRequest(params);

        try {
            const { data } = await instance.get(
                `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/commits/${params.commitId}/changes?api-version=7.1`,
            );

            return data?.changes || [];
        } catch (error) {
            // Verificar se é um erro de versão não encontrada
            if (
                error.response &&
                error.response.data &&
                error.response.data.message &&
                error.response.data.message.includes('TF401175')
            ) {
                throw new Error(
                    `O commit ${params.commitId} não pode ser encontrado no repositório ou você não tem permissão para acessá-lo.`,
                );
            }

            // Se for outro erro, repasse
            throw error;
        }
    }

    async createIssueComment(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        prId: number;
        comment: string;
    }): Promise<any> {
        const instance = await this.azureRequest(params);

        const payload = {
            comments: [
                {
                    content: params.comment,
                    commentType: AzureRepoCommentType.TEXT,
                },
            ],
            status: 'active',
        };

        const { data } = await instance.post(
            `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/pullRequests/${params.prId}/threads?api-version=7.1`,
            payload,
        );

        return data;
    }

    async votePullRequest(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        prId: number;
        reviewerId: string;
        vote: number; // 10 = approve, -10 = reject/request changes
    }): Promise<any> {
        const instance = await this.azureRequest(params);

        const url = `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/pullRequests/${params.prId}/reviewers/${params.reviewerId}?api-version=7.1`;

        const payload = { vote: params.vote };

        const { data } = await instance.put(url, payload);
        return data;
    }

    async getListOfPullRequestReviewers(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        prId: number;
    }): Promise<AzureRepoReviewerWithVote[]> {
        const instance = await this.azureRequest(params);

        const url = `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/pullRequests/${params.prId}/reviewers/?api-version=7.1`;

        const { data } = await instance.get(url);

        return data?.value ?? [];
    }

    async getRepositoryContentFile(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        commitId: string;
        filePath: string;
    }): Promise<{ content: string } | null> {
        const instance = await this.azureRequest(params);

        const { data } = await instance.get(
            `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/items?path=${encodeURIComponent(
                params.filePath,
            )}&versionDescriptor.version=${params.commitId}&versionDescriptor.versionType=commit&includeContent=true&resolveLfs=true&api-version=7.1`,
        );

        return {
            content: data?.content || '',
        };
    }

    async getCommitsForPullRequest(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        prId: number | string;
    }): Promise<any[]> {
        const instance = await this.azureRequest(params);

        const { data } = await instance.get(
            `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/pullrequests/${params.prId}/commits?api-version=7.1`,
        );

        return data?.value ?? [];
    }

    async getCommit(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        commitId: string;
    }): Promise<any | null> {
        const instance = await this.azureRequest(params);

        const { data } = await instance.get(
            `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/commits/${params.commitId}?api-version=7.1`,
        );

        return data ?? null;
    }

    async updatePullRequestDescription(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        prId: number;
        description: string;
    }): Promise<any> {
        const instance = await this.azureRequest(params);

        const { data } = await instance.patch(
            `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/pullRequests/${params.prId}?api-version=7.1`,
            {
                description: params.description,
            },
        );

        return data;
    }

    async updateCommentOnPullRequest(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        prNumber: number;
        threadId: number;
        commentId: number;
        content: string;
    }): Promise<any> {
        const instance = await this.azureRequest(params);

        const { data } = await instance.patch(
            `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/pullRequests/${params.prNumber}/threads/${params.threadId}/comments/${params.commentId}?api-version=7.1`,
            {
                content: params.content,
                commentType: AzureRepoCommentType.TEXT,
            },
        );

        return data;
    }

    async replyToThreadComment(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        prId: number;
        threadId: number;
        comment: string;
    }): Promise<any> {
        const instance = await this.azureRequest(params);

        const payload = {
            content: params.comment,
            commentType: AzureRepoCommentType.TEXT,
        };

        const { data } = await instance.post(
            `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/pullRequests/${params.prId}/threads/${params.threadId}/comments?api-version=7.1`,
            payload,
        );

        return data;
    }

    async getUser(params: {
        orgName: string;
        token: string;
        identifier: string;
    }): Promise<any> {
        const instance = await this.azureRequest({
            ...params,
            useGraphApi: true,
        });

        const isDescriptor = /^(aad|msa|vss|svc)\./.test(params.identifier);

        let url = '';
        if (isDescriptor) {
            url = `https://vssps.dev.azure.com/${params.orgName}/_apis/graph/users/${params.identifier}?api-version=7.1-preview.1`;
        } else {
            url = `https://vssps.dev.azure.com/${params.orgName}/_apis/graph/users?filterValue=${encodeURIComponent(params.identifier)}&api-version=7.1-preview.1`;
        }

        const { data } = await instance.get(url);

        if (isDescriptor) {
            return data ?? null;
        }

        const users = data?.value ?? [];

        // Priorize users from Azure AD or MSA
        const preferredUser = users.find(
            (u: any) => u.origin === 'aad' || u.origin === 'msa',
        );

        return preferredUser ?? users[0] ?? null;
    }

    mapAzureStatusToFileChangeStatus(status: string): FileChange['status'] {
        switch (status.toLowerCase()) {
            case 'add':
            case 'added':
                return 'added';
            case 'edit':
            case 'modified':
                return 'modified';
            case 'delete':
            case 'removed':
                return 'removed';
            case 'rename':
            case 'renamed':
                return 'renamed';
            case 'copy':
            case 'copied':
                return 'copied';
            case 'unchanged':
                return 'unchanged';
            default:
                return 'changed';
        }
    }

    /**
     * Lists repository items recursively at a given branch (default branch or specific ref)
     */
    async listRepositoryItemsRecursive(params: {
        orgName: string;
        token: string;
        projectId: string;
        repositoryId: string;
        branch: string;
    }): Promise<Array<{ path: string; objectId: string; size?: number }>> {
        const instance = await this.azureRequest(params);
        const { data } = await instance.get(
            `/${params.projectId}/_apis/git/repositories/${params.repositoryId}/items?recursionLevel=Full&version=${encodeURIComponent(
                params.branch,
            )}&versionType=branch&includeLinks=false&api-version=7.1`,
        );
        const values = (data?.value || []) as any[];
        return values
            .filter((v) => v?.gitObjectType === 'blob')
            .map((v) => ({ path: String(v?.path || '').replace(/^\//, ''), objectId: v?.objectId, size: v?.size }));
    }
}
