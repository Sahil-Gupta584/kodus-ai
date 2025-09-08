import { Inject, Injectable } from '@nestjs/common';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { AGENT_SERVICE_TOKEN } from '@/core/domain/agents/contracts/agent.service.contracts';
import { IntegrationConfigEntity } from '@/core/domain/integrationConfigs/entities/integration-config.entity';
import { AgentService } from '@/core/infrastructure/adapters/services/agent/agent.service';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { PlatformType } from '@/shared/domain/enums/platform-type.enum';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { ConversationAgentUseCase } from '../../agent/conversation-agent.use-case';
import { BusinessRulesValidationAgentUseCase } from '../../agent/business-rules-validation-agent.use-case';
import { createThreadId } from '@kodus/flow';
import posthogClient from '@/shared/utils/posthog';

interface WebhookParams {
    event: string;
    payload: any;
    platformType: PlatformType;
}

interface Repository {
    name: string;
    id: string;
}

interface Sender {
    login: string;
    id: string;
}

interface Comment {
    id: number;
    body: string;
    in_reply_to_id?: number;
    parent?: {
        id: number;
        links?: any;
    };
    replies?: Comment[];
    content?: {
        raw: string;
        markup?: string;
        html?: string;
        type?: string;
    };
    path?: string;
    deleted?: boolean;
    user?: { login?: string; display_name?: string };
    author?: {
        name?: string;
        username?: string;
        display_name?: string;
        id?: string;
    };
    diff_hunk?: string;
    discussion_id?: string;
    originalCommit?: any;
    // Azure Repos specific properties
    threadId?: number;
    thread?: any;
    commentType?: string;
}

@Injectable()
export class ChatWithKodyFromGitUseCase {
    constructor(
        @Inject(AGENT_SERVICE_TOKEN)
        private readonly agentService: AgentService,

        private readonly logger: PinoLoggerService,
        private readonly codeManagementService: CodeManagementService,
        private readonly conversationAgentUseCase: ConversationAgentUseCase,
        private readonly businessRulesValidationAgentUseCase: BusinessRulesValidationAgentUseCase,
    ) {}

    async execute(params: WebhookParams): Promise<void> {
        this.logger.log({
            message: 'Receiving pull request review webhook for conversation',
            context: ChatWithKodyFromGitUseCase.name,
            metadata: { eventName: params.event },
        });

        try {
            if (!this.isRelevantAction(params)) {
                return;
            }

            const repository = this.getRepository(params);
            const integrationConfig = await this.getIntegrationConfig(
                params.platformType,
                repository,
            );
            const organizationAndTeamData =
                this.extractOrganizationAndTeamData(integrationConfig);
            const pullRequestNumber = this.getPullRequestNumber(params);
            const allComments =
                await this.codeManagementService.getPullRequestReviewComment({
                    organizationAndTeamData,
                    filters: {
                        pullRequestNumber,
                        repository,
                        discussionId:
                            params.payload?.object_attributes?.discussion_id ??
                            '',
                    },
                });

            const commentId = this.getCommentId(params);
            const comment =
                params.platformType !== PlatformType.AZURE_REPOS
                    ? allComments?.find((c) => c.id === commentId)
                    : this.getReviewThreadByCommentId(commentId, allComments);

            if (!comment) {
                return;
            }

            if (this.shouldIgnoreComment(comment, params.platformType)) {
                this.logger.log({
                    message:
                        'Comment made by Kody or does not mention Kody/Kodus. Ignoring.',
                    context: ChatWithKodyFromGitUseCase.name,
                    serviceName: ChatWithKodyFromGitUseCase.name,
                    metadata: {
                        repository,
                        pullRequestNumber,
                    },
                });
                return;
            }

            const originalKodyComment = this.getOriginalKodyComment(
                comment,
                allComments,
                params.platformType,
            );
            const othersReplies = this.getOthersReplies(
                comment,
                allComments,
                params.platformType,
            );
            const sender = this.getSender(params);

            const message = this.prepareMessage(
                comment,
                originalKodyComment,
                sender.login,
                othersReplies,
            );

            const ackResponse =
                await this.codeManagementService.createResponseToComment({
                    organizationAndTeamData,
                    inReplyToId: comment.id,
                    discussionId:
                        params.payload?.object_attributes?.discussion_id,
                    threadId: comment.threadId,
                    body: this.getAcknowledgmentBody(params.platformType),
                    repository,
                    prNumber: pullRequestNumber,
                });

            if (!ackResponse) {
                this.logger.warn({
                    message: 'Failed to create acknowledgment response',
                    context: ChatWithKodyFromGitUseCase.name,
                    serviceName: ChatWithKodyFromGitUseCase.name,
                    metadata: {
                        repository,
                        pullRequestNumber,
                        commentId: comment.id,
                    },
                });
                return;
            }

            const [ackResponseId, parentId] = this.getAcknowledgmentIds(
                originalKodyComment,
                ackResponse,
                params.platformType,
            );

            if (!ackResponseId || !parentId) {
                this.logger.warn({
                    message:
                        'Failed to get acknowledgment response ID or parent ID',
                    context: ChatWithKodyFromGitUseCase.name,
                    serviceName: ChatWithKodyFromGitUseCase.name,
                    metadata: {
                        repository,
                        pullRequestNumber,
                        commentId: comment.id,
                    },
                });
                return;
            }

            let response = '';
            if (
                await posthogClient.isFeatureEnabled(
                    'conversation-agent',
                    organizationAndTeamData.organizationId,
                    organizationAndTeamData,
                )
            ) {
                const prepareContext = this.prepareContext({
                    comment,
                    originalKodyComment,
                    gitUserName: sender.login,
                    othersReplies,
                    pullRequestNumber,
                    repository,
                    platformType: params.platformType,
                });

                const thread = createThreadId(
                    {
                        organizationId: organizationAndTeamData.organizationId,
                        teamId: organizationAndTeamData.teamId,
                        repositoryId: repository.id,
                        userId: sender.id,
                        suggestionCommentId: originalKodyComment?.id,
                    },
                    {
                        prefix: 'cmc', // Code Management Chat
                    },
                );

                if (
                    prepareContext.userQuestion
                        .toLowerCase()
                        .includes('@kody -v business-logic')
                ) {
                    const pullRequestData =
                        await this.codeManagementService.getPullRequest({
                            organizationAndTeamData,
                            repository: {
                                name: repository.name,
                                id: repository.id,
                            },
                            prNumber: pullRequestNumber,
                        });

                    const validationResult =
                        await this.businessRulesValidationAgentUseCase.validatePullRequest(
                            organizationAndTeamData,
                            pullRequestData,
                            repository,
                            thread,
                        );

                    response = this.formatValidationResponse(validationResult);
                } else {
                    response = await this.conversationAgentUseCase.execute({
                        prompt: prepareContext.userQuestion,
                        organizationAndTeamData,
                        prepareContext: prepareContext,
                        thread: thread,
                    });
                }
            } else {
                response = await this.agentService.conversationWithKody(
                    organizationAndTeamData,
                    sender.id,
                    message,
                    sender.login,
                );
            }

            if (!response) {
                this.logger.warn({
                    message: 'No response generated by Kody',
                    context: ChatWithKodyFromGitUseCase.name,
                    serviceName: ChatWithKodyFromGitUseCase.name,
                    metadata: {
                        repository,
                        pullRequestNumber,
                        commentId: comment.id,
                    },
                });
                return;
            }

            const updatedComment =
                await this.codeManagementService.updateResponseToComment({
                    organizationAndTeamData,
                    parentId,
                    commentId: ackResponseId,
                    body: response,
                    prNumber: pullRequestNumber,
                    repository,
                });

            if (!updatedComment) {
                this.logger.warn({
                    message: 'Failed to update acknowledgment response',
                    context: ChatWithKodyFromGitUseCase.name,
                    serviceName: ChatWithKodyFromGitUseCase.name,
                    metadata: {
                        repository,
                        pullRequestNumber,
                        commentId: comment.id,
                    },
                });
                return;
            }

            this.logger.log({
                message: 'Successfully executed the git comment response agent',
                context: ChatWithKodyFromGitUseCase.name,
                serviceName: ChatWithKodyFromGitUseCase.name,
                metadata: {
                    repository,
                    pullRequestNumber,
                    commentId: comment.id,
                    responseId: ackResponseId,
                },
            });
        } catch (error) {
            this.logger.error({
                message: 'Error while executing the git comment response agent',
                context: ChatWithKodyFromGitUseCase.name,
                serviceName: ChatWithKodyFromGitUseCase.name,
                error,
            });
        }
    }

    private isRelevantAction(params: WebhookParams): boolean {
        const action = params.payload?.action;
        const eventType = params.payload?.event_type;

        if (
            (action && action !== 'created') ||
            (!action && eventType && eventType !== 'note')
        ) {
            return false;
        }

        return true;
    }

    private prepareMessage(
        comment: Comment,
        originalKodyComment: Comment,
        userName: string,
        othersReplies: Comment[],
    ): string {
        const userQuestion =
            comment.body.trim() === '@kody'
                ? 'The user did not ask any questions. Ask them what they would like to know about the codebase or suggestions for code changes.'
                : comment.body;

        return JSON.stringify({
            userName,
            userQuestion,
            context: {
                originalComment: {
                    text: originalKodyComment?.body,
                    diffHunk: originalKodyComment?.diff_hunk,
                },
                othersReplies: othersReplies.map((reply) => ({
                    text: reply.body,
                    diffHunk: reply.diff_hunk,
                })),
            },
        });
    }

    private async getIntegrationConfig(
        platformType: PlatformType,
        repository: Repository,
    ): Promise<IntegrationConfigEntity> {
        return await this.codeManagementService.findTeamAndOrganizationIdByConfigKey(
            {
                repository: repository,
            },
            platformType,
        );
    }

    private extractOrganizationAndTeamData(
        integrationConfig: IntegrationConfigEntity,
    ): OrganizationAndTeamData {
        return {
            organizationId: integrationConfig?.integration?.organization?.uuid,
            teamId: integrationConfig?.team?.uuid,
        };
    }

    private getRepository(params: WebhookParams): Repository {
        switch (params.platformType) {
            case PlatformType.GITHUB:
                return {
                    name: params.payload?.repository?.name,
                    id: params.payload?.repository?.id,
                };
            case PlatformType.GITLAB:
                return {
                    name: params.payload?.project?.name,
                    id: params.payload?.project?.id,
                };
            case PlatformType.BITBUCKET:
                return {
                    name: params.payload?.repository?.name,
                    id:
                        params.payload?.repository?.uuid?.slice(1, -1) ||
                        params.payload?.repository?.id,
                };
            case PlatformType.AZURE_REPOS:
                return {
                    name: params.payload?.resource?.pullRequest?.repository
                        ?.name,
                    id: params.payload?.resource?.pullRequest?.repository?.id,
                };
            default:
                this.logger.warn({
                    message: `Unsupported platform type: ${params.platformType}`,
                    context: ChatWithKodyFromGitUseCase.name,
                });
                return { name: '', id: '' };
        }
    }

    private getPullRequestNumber(params: WebhookParams): number {
        switch (params.platformType) {
            case PlatformType.GITHUB:
                return params.payload?.pull_request?.number;
            case PlatformType.GITLAB:
                return params.payload?.merge_request?.iid;
            case PlatformType.BITBUCKET:
                return params.payload?.pullrequest?.id;
            case PlatformType.AZURE_REPOS:
                return params.payload?.resource?.pullRequest?.pullRequestId;
            default:
                this.logger.warn({
                    message: `Unsupported platform type: ${params.platformType}`,
                    context: ChatWithKodyFromGitUseCase.name,
                });
                return 0;
        }
    }

    private getReviewThreadByCommentId(
        commentId: number,
        reviewComments: any[],
    ): any | null {
        try {
            let thread = null;
            let targetComment = null;

            for (const commentThread of reviewComments) {
                // Check if the main comment matches the ID
                if (commentThread.id === commentId) {
                    thread = commentThread;
                    targetComment = commentThread;
                    break;
                }

                // Check if any reply matches the ID
                const matchingReply = commentThread.replies?.find(
                    (reply: any) => reply.id === commentId,
                );

                if (matchingReply) {
                    thread = commentThread;
                    targetComment = matchingReply;
                    break;
                }
            }

            if (thread && targetComment) {
                // Return the exact format requested
                return {
                    ...targetComment,
                    thread,
                };
            }

            return null;
        } catch (error) {
            this.logger.error({
                message: 'Failed to find thread by commentId',
                context: 'AzureReposService.getReviewThreadByCommentId',
                error,
                metadata: { commentId },
            });
            return null;
        }
    }

    private getCommentId(params: WebhookParams): number {
        switch (params.platformType) {
            case PlatformType.GITHUB:
                return params.payload?.comment?.id;
            case PlatformType.GITLAB:
                return params.payload?.object_attributes?.id;
            case PlatformType.BITBUCKET:
                return params.payload?.comment?.id;
            case PlatformType.AZURE_REPOS:
                return params.payload?.resource?.comment?.id;
            default:
                this.logger.warn({
                    message: `Unsupported platform type: ${params.platformType}`,
                    context: ChatWithKodyFromGitUseCase.name,
                });
                return 0;
        }
    }

    private shouldIgnoreComment(
        comment: any,
        platformType: PlatformType,
    ): boolean {
        // For all platforms, check if the comment is from Kody or doesn't mention Kody
        return (
            this.isKodyComment(comment, platformType) ||
            !this.mentionsKody(comment, platformType)
        );
    }

    private getOriginalKodyComment(
        comment: Comment,
        allComments: Comment[],
        platformType: PlatformType,
    ): Comment | undefined {
        switch (platformType) {
            case PlatformType.GITHUB:
                if (!comment?.in_reply_to_id) {
                    return undefined;
                }

                return allComments.find(
                    (originalComment) =>
                        originalComment.id === comment.in_reply_to_id &&
                        this.isKodyComment(originalComment, platformType),
                );
            case PlatformType.GITLAB:
                return comment?.originalCommit;
            case PlatformType.BITBUCKET:
                // If the comment doesn't have a parent, it is the original comment
                if (!comment?.parent?.id) {
                    return undefined;
                }

                // Find the original comment that is a reply to the parent comment
                const originalComment = allComments.find(
                    (c) =>
                        c.id === comment.parent.id &&
                        this.isKodyComment(c, platformType),
                );

                return originalComment;
            case PlatformType.AZURE_REPOS:
                // For Azure Repos, check if this is a reply to a thread
                if (comment.threadId && comment.id !== comment.threadId) {
                    // This is a reply, find the original thread comment
                    const originalComment = comment.thread;
                    return originalComment;
                }
            default:
                this.logger.warn({
                    message: `Unsupported platform type: ${platformType}`,
                    context: ChatWithKodyFromGitUseCase.name,
                });
                return undefined;
        }
    }

    private getOthersReplies(
        comment: Comment,
        allComments: Comment[],
        platformType: PlatformType,
    ): Comment[] {
        switch (platformType) {
            case PlatformType.GITHUB:
                return allComments.filter(
                    (reply) =>
                        reply.in_reply_to_id === comment.in_reply_to_id &&
                        !this.isKodyComment(reply, platformType),
                );
            case PlatformType.BITBUCKET:
                if (comment.parent?.id) {
                    const originalComment = allComments.find(
                        (c) => c.id === comment.parent.id,
                    );

                    if (!originalComment) {
                        return [];
                    }

                    if (
                        originalComment.replies &&
                        Array.isArray(originalComment.replies)
                    ) {
                        const validReplies = [];

                        for (const reply of originalComment.replies) {
                            if (
                                reply.content?.raw === '' ||
                                reply.deleted === true
                            ) {
                                continue;
                            }

                            if (reply.id === comment.id) {
                                continue;
                            }
                            if (
                                this.isKodyComment(
                                    {
                                        body: reply.content?.raw,
                                        id: reply.id,
                                        author: {
                                            name: reply.user?.display_name,
                                        },
                                    },
                                    platformType,
                                )
                            ) {
                                continue;
                            }

                            if (reply.content?.raw) {
                                validReplies.push({
                                    ...reply,
                                    body: reply.content.raw,
                                });
                            } else {
                                validReplies.push(reply);
                            }
                        }

                        return validReplies;
                    }
                }
            case PlatformType.AZURE_REPOS:
                if (comment.threadId) {
                    const thread = allComments.find(
                        (c) => c.threadId === comment.threadId,
                    );

                    if (
                        thread &&
                        thread.replies &&
                        Array.isArray(thread.replies)
                    ) {
                        return thread.replies.filter(
                            (reply) =>
                                reply.id !== comment.id &&
                                !this.isKodyComment(reply, platformType),
                        );
                    }
                    return [];
                }

                return allComments.filter(
                    (reply) =>
                        reply.in_reply_to_id === comment.in_reply_to_id &&
                        !this.isKodyComment(reply, platformType),
                );
            case PlatformType.GITLAB:
                return allComments.filter(
                    (reply) =>
                        reply.in_reply_to_id === comment.in_reply_to_id &&
                        !this.isKodyComment(reply, platformType),
                );
            default:
                this.logger.warn({
                    message: `Plataforma nu00e3o suportada: ${platformType}`,
                    context: ChatWithKodyFromGitUseCase.name,
                });
                return [];
        }
    }

    private getSender(params: WebhookParams): Sender {
        switch (params.platformType) {
            case PlatformType.GITHUB:
                return {
                    login: params.payload?.sender?.login,
                    id: params.payload?.sender?.id,
                };
            case PlatformType.GITLAB:
                return {
                    login: params.payload?.user?.name,
                    id: params.payload?.user?.id,
                };
            case PlatformType.BITBUCKET:
                return {
                    login:
                        params.payload?.actor?.display_name ||
                        params.payload?.actor?.nickname,
                    id:
                        params.payload?.actor?.uuid?.slice(1, -1) ||
                        params.payload?.actor?.account_id,
                };
            case PlatformType.AZURE_REPOS:
                return {
                    login: params.payload?.resource?.comment?.author
                        ?.displayName,
                    id: params.payload?.resource?.comment?.author?.id,
                };
            default:
                this.logger.warn({
                    message: `Plataforma nu00e3o suportada: ${params.platformType}`,
                    context: ChatWithKodyFromGitUseCase.name,
                });
                return { login: '', id: '' };
        }
    }

    private prepareContext({
        comment,
        originalKodyComment,
        gitUserName,
        othersReplies,
        pullRequestNumber,
        repository,
        platformType,
    }: {
        comment?: Comment;
        originalKodyComment?: Comment;
        gitUserName?: string;
        othersReplies?: Comment[];
        repository?: Repository;
        platformType?: PlatformType;
        pullRequestNumber?: number;
    }): any {
        const userQuestion =
            comment.body.trim() === '@kody'
                ? 'The user did not ask any questions. Ask them what they would like to know about the codebase or suggestions for code changes.'
                : comment.body;

        return {
            gitUserName,
            userQuestion,
            pullRequestNumber,
            repository,
            platformType,
            codeManagementContext: {
                originalComment: {
                    suggestionCommentId: originalKodyComment?.id,
                    suggestionFilePath: comment?.path,
                    suggestionText: originalKodyComment?.body,
                    diffHunk: originalKodyComment?.diff_hunk,
                },
                othersReplies: othersReplies.map((reply) => ({
                    historyConversationText: reply.body,
                })),
            },
        };
    }

    private mentionsKody(
        comment: Comment,
        platformType: PlatformType,
    ): boolean {
        const commentBody = comment.body.toLowerCase();
        return ['@kody', '@kodus'].some((keyword) =>
            commentBody.startsWith(keyword),
        );
    }

    private isKodyComment(
        comment: Comment,
        platformType: PlatformType,
    ): boolean {
        const login =
            platformType === PlatformType.GITHUB
                ? comment.user?.login
                : comment.author?.name;
        const body = comment.body.toLowerCase();
        const bodyWithoutMarkdown =
            platformType !== PlatformType.BITBUCKET
                ? 'kody-codereview'
                : 'kody|code-review';

        return (
            ['kody', 'kodus'].some((keyword) => login?.includes(keyword)) ||
            body.includes(bodyWithoutMarkdown)
        );
    }

    private getAcknowledgmentBody(platformType: PlatformType): string {
        let msg = 'Analyzing your request...';
        if (platformType !== PlatformType.BITBUCKET) {
            msg = `${msg}<!-- kody-codereview -->\n&#8203;`;
        }
        return msg.trim();
    }

    private getAcknowledgmentIds(
        originalKodyComment: Comment,
        ackResponse: any,
        platformType: PlatformType,
    ): [ackResponseId: string, parentId: string] {
        let ackResponseId;
        let parentId;
        switch (platformType) {
            case PlatformType.GITHUB:
                ackResponseId = ackResponse.id;
                parentId = originalKodyComment?.id;
                break;
            case PlatformType.GITLAB:
                ackResponseId = ackResponse?.notes?.[0]?.id ?? ackResponse.id;
                parentId = originalKodyComment?.id;
                break;
            case PlatformType.BITBUCKET:
                ackResponseId = ackResponse.id;
                parentId = originalKodyComment?.id;
                break;
            case PlatformType.AZURE_REPOS:
                ackResponseId = ackResponse?.id;
                parentId = originalKodyComment?.threadId;
                break;
            default:
                this.logger.warn({
                    message: `Unsupported platform type: ${platformType}`,
                    context: ChatWithKodyFromGitUseCase.name,
                    metadata: {
                        originalKodyComment,
                        ackResponse,
                        platformType,
                    },
                });
                return ['', ''];
        }

        if (!ackResponseId || !parentId) {
            return ['', ''];
        }

        return [ackResponseId, parentId];
    }

    private formatValidationResponse(validationResult: any): string {
        if (!validationResult) {
            return '❌ Erro ao processar validação de regras de negócio.';
        }

        const { isValid, violations, summary, complianceScore } =
            validationResult;

        let response = `## 🔍 Validação de Regras de Negócio\n\n`;
        response += `**Status:** ${isValid ? '✅ Válido' : '❌ Violações encontradas'}\n`;
        response += `**Score de Compliance:** ${complianceScore || 0}/100\n\n`;
        response += `**Resumo:** ${summary || 'Validação concluída'}\n\n`;

        if (violations && violations.length > 0) {
            response += `### 🚨 Violações Encontradas (${violations.length})\n\n`;

            violations.forEach((violation: any, index: number) => {
                const severityIcon =
                    violation.severity === 'error'
                        ? '🔴'
                        : violation.severity === 'warning'
                          ? '🟡'
                          : '🔵';

                response += `${severityIcon} **${violation.severity?.toUpperCase()}** - ${violation.rule}\n`;
                response += `   ${violation.message}\n`;

                if (violation.file) {
                    response += `   📁 Arquivo: ${violation.file}`;
                    if (violation.line) {
                        response += ` (linha ${violation.line})`;
                    }
                    response += `\n`;
                }

                if (violation.suggestion) {
                    response += `   💡 Sugestão: ${violation.suggestion}\n`;
                }

                response += `\n`;
            });
        } else {
            response += `### ✅ Nenhuma violação encontrada!\n`;
            response += `O código está em conformidade com as regras de negócio definidas.`;
        }

        return response;
    }
}
