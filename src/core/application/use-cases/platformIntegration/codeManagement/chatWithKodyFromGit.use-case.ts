import { Inject, Injectable } from '@nestjs/common';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { AGENT_SERVICE_TOKEN } from '@/core/domain/agents/contracts/agent.service.contracts';
import { IntegrationConfigEntity } from '@/core/domain/integrationConfigs/entities/integration-config.entity';
import { AgentService } from '@/core/infrastructure/adapters/services/agent/agent.service';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { PlatformType } from '@/shared/domain/enums/platform-type.enum';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';

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
}

@Injectable()
export class ChatWithKodyFromGitUseCase {
    constructor(
        private readonly logger: PinoLoggerService,
        private readonly codeManagementService: CodeManagementService,
        @Inject(AGENT_SERVICE_TOKEN)
        private readonly agentService: AgentService,
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
            const comment = allComments?.find((c) => c.id === commentId);

            if (!comment) {
                return;
            }

            if (this.shouldIgnoreComment(comment, params.platformType)) {
                this.logger.log({
                    message:
                        'Comment made by Kody or does not mention Kody/Kodus. Ignoring.',
                    context: ChatWithKodyFromGitUseCase.name,
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
            const response = await this.agentService.conversationWithKody(
                organizationAndTeamData,
                sender.id,
                message,
                sender.login,
            );

            await this.codeManagementService.createResponseToComment({
                organizationAndTeamData,
                inReplyToId: comment.id,
                discussionId: params.payload?.object_attributes?.discussion_id,
                body: response,
                repository,
                prNumber: pullRequestNumber,
            });
        } catch (error) {
            this.logger.error({
                message: 'Error while executing the git comment response agent',
                context: ChatWithKodyFromGitUseCase.name,
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
        comment: Comment,
        platformType: PlatformType,
    ): boolean {
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
                // No Bitbucket, procuramos pelo comentário original usando o parent.id
                // Se o comentário não tem parent, ele é o comentário original
                if (!comment?.parent?.id) {
                    return undefined;
                }

                // Encontrar o comentário original que é do Kody
                const originalComment = allComments.find(
                    (c) =>
                        c.id === comment.parent.id &&
                        this.isKodyComment(c, platformType),
                );

                return originalComment;
            case PlatformType.AZURE_REPOS:
                // No Azure Repos, procuramos pelo comentário original usando o parentCommentId
                if (!comment?.in_reply_to_id) {
                    return undefined;
                }

                return allComments.find(
                    (originalComment) =>
                        originalComment.id === comment.in_reply_to_id &&
                        this.isKodyComment(originalComment, platformType),
                );
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
                // Para GitHub, filtramos as respostas usando in_reply_to_id
                return allComments.filter(
                    (reply) =>
                        reply.in_reply_to_id === comment.in_reply_to_id &&
                        !this.isKodyComment(reply, platformType),
                );
            case PlatformType.BITBUCKET:
                // Para Bitbucket, precisamos processar a estrutura específica dos comentários
                if (comment.parent?.id) {
                    // Se o comentário atual é uma resposta, encontramos o comentário original
                    const originalComment = allComments.find(
                        (c) => c.id === comment.parent.id,
                    );

                    if (!originalComment) {
                        return [];
                    }

                    // Verificamos se o comentário original tem replies estruturadas
                    if (
                        originalComment.replies &&
                        Array.isArray(originalComment.replies)
                    ) {
                        // Filtramos as respostas que não são do Kody e não são o comentário atual
                        const validReplies = [];

                        for (const reply of originalComment.replies) {
                            // Verificamos se a resposta tem conteúdo válido
                            if (
                                reply.content?.raw === '' ||
                                reply.deleted === true
                            ) {
                                continue;
                            }

                            // Verificamos se não é o comentário atual
                            if (reply.id === comment.id) {
                                continue;
                            }

                            // Verificamos se não é um comentário do Kody
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

                            // Se a resposta tem content.raw, usamos isso como body
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
                // Para Azure, filtramos as respostas usando in_reply_to_id
                return allComments.filter(
                    (reply) =>
                        reply.in_reply_to_id === comment.in_reply_to_id &&
                        !this.isKodyComment(reply, platformType),
                );
            case PlatformType.GITLAB:
                // Para GitLab, mantemos a lu00f3gica original
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
                    login: params.payload?.resource?.createdBy?.displayName,
                    id: params.payload?.resource?.createdBy?.id,
                };
            default:
                this.logger.warn({
                    message: `Plataforma nu00e3o suportada: ${params.platformType}`,
                    context: ChatWithKodyFromGitUseCase.name,
                });
                return { login: '', id: '' };
        }
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

        const teste =
            ['kody', 'kodus'].some((keyword) => login?.includes(keyword)) ||
            body.includes(bodyWithoutMarkdown);

        return teste;
    }
}
