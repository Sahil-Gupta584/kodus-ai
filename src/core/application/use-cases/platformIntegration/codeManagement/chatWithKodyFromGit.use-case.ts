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

// Constants
const KODY_COMMANDS = {
    BUSINESS_LOGIC_VALIDATION: '@kody -v business-logic',
    KODY_MENTION: '@kody',
    KODUS_MENTION: '@kodus',
} as const;

const KODY_IDENTIFIERS = {
    LOGIN_KEYWORDS: ['kody', 'kodus'],
    MARKDOWN_IDENTIFIERS: {
        DEFAULT: 'kody-codereview',
        BITBUCKET: 'kody|code-review',
    },
} as const;

const ACKNOWLEDGMENT_MESSAGES = {
    DEFAULT: 'Analyzing your request...',
    MARKDOWN_SUFFIX: '<!-- kody-codereview -->\n&#8203;',
} as const;

const THREAD_PREFIX = 'cmc'; // Code Management Chat

// Enums
enum CommandType {
    BUSINESS_LOGIC_VALIDATION = 'business_logic_validation',
    CONVERSATION = 'conversation',
    UNKNOWN = 'unknown',
}

// Command Handler Interface
interface CommandHandler {
    canHandle(userQuestion: string): boolean;
    getCommandType(): CommandType;
}

// Business Logic Validation Command Handler
class BusinessLogicValidationCommandHandler implements CommandHandler {
    canHandle(userQuestion: string): boolean {
        return userQuestion
            .toLowerCase()
            .trim()
            .startsWith(KODY_COMMANDS.BUSINESS_LOGIC_VALIDATION);
    }

    getCommandType(): CommandType {
        return CommandType.BUSINESS_LOGIC_VALIDATION;
    }
}

// Conversation Command Handler
class ConversationCommandHandler implements CommandHandler {
    canHandle(userQuestion: string): boolean {
        const trimmedQuestion = userQuestion.toLowerCase().trim();

        const startsWithMention =
            trimmedQuestion.startsWith(KODY_COMMANDS.KODY_MENTION) ||
            trimmedQuestion.startsWith(KODY_COMMANDS.KODUS_MENTION);

        if (!startsWithMention) {
            return false;
        }

        if (trimmedQuestion.includes(' -v ')) {
            return false;
        }

        return true;
    }

    getCommandType(): CommandType {
        return CommandType.CONVERSATION;
    }
}

// Command Manager
class CommandManager {
    private handlers: CommandHandler[] = [
        new BusinessLogicValidationCommandHandler(),
        new ConversationCommandHandler(),
    ];

    getCommandType(userQuestion: string): CommandType {
        const handler = this.handlers.find((h) => h.canHandle(userQuestion));
        return handler?.getCommandType() ?? CommandType.UNKNOWN;
    }
}

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
    private readonly commandManager = new CommandManager();

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
                        prefix: THREAD_PREFIX,
                    },
                );

                const commandType = this.commandManager.getCommandType(
                    prepareContext.userQuestion,
                );
                response = await this.processCommand(commandType, {
                    prepareContext,
                    organizationAndTeamData,
                    repository,
                    pullRequestNumber,
                    thread,
                });
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
        return [KODY_COMMANDS.KODY_MENTION, KODY_COMMANDS.KODUS_MENTION].some(
            (keyword) => commentBody.startsWith(keyword),
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
                ? KODY_IDENTIFIERS.MARKDOWN_IDENTIFIERS.DEFAULT
                : KODY_IDENTIFIERS.MARKDOWN_IDENTIFIERS.BITBUCKET;

        return (
            KODY_IDENTIFIERS.LOGIN_KEYWORDS.some((keyword) =>
                login?.includes(keyword),
            ) || body.includes(bodyWithoutMarkdown)
        );
    }

    private getAcknowledgmentBody(platformType: PlatformType): string {
        let msg: string = ACKNOWLEDGMENT_MESSAGES.DEFAULT;
        if (platformType !== PlatformType.BITBUCKET) {
            msg = `${msg}${ACKNOWLEDGMENT_MESSAGES.MARKDOWN_SUFFIX}`;
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

        // Se o agent precisa de mais informações
        if (validationResult.needsMoreInfo) {
            return `## 🤔 Preciso de Informações da Tarefa

${validationResult.missingInfo || 'Não encontrei informações específicas da tarefa para validar. Preciso de detalhes sobre o que deve ser implementado.'}

### 🔍 O que preciso para validar:
- **Link direto da tarefa** (Jira, Notion, Google Docs, etc.)
- **Descrição detalhada** do que deve ser implementado
- **Critérios de aceitação** da tarefa
- **Requisitos de negócio** específicos

### 💡 Exemplos de como fornecer:
- **Jira:** \`@kody -v business-logic https://kodustech.atlassian.net/jira/KC-123\`
- **Notion:** \`@kody -v business-logic https://notion.so/minha-task\`
- **Descrição:** \`@kody -v business-logic implementar validação de CPF com máscara e verificação de dígitos\`
- **Google Docs:** \`@kody -v business-logic https://docs.google.com/document/d/123\`

### ⚠️ Importante:
Sem informações específicas da tarefa, não posso validar se as regras de negócio estão corretamente implementadas no código.`;
        }

        const {
            isValid,
            violations,
            summary,
            complianceScore,
            confidence,
            implementedCorrectly,
            missingOrIncomplete,
            edgeCasesAndAssumptions,
            businessLogicIssues,
        } = validationResult;

        // Determinar se há problemas baseado em TODOS os campos de problemas
        const hasAnyProblems =
            (violations && violations.length > 0) ||
            (missingOrIncomplete && missingOrIncomplete.length > 0) ||
            (edgeCasesAndAssumptions && edgeCasesAndAssumptions.length > 0) ||
            (businessLogicIssues && businessLogicIssues.length > 0) ||
            complianceScore === 0 ||
            complianceScore < 50;

        let response = `## 🔍 Validação de Regras de Negócio\n\n`;
        response += `**Status:** ${hasAnyProblems ? '❌ Problemas encontrados' : '✅ Válido'}\n`;
        response += `**Score de Compliance:** ${complianceScore || 0}/100\n`;
        response += `**Confiança da Análise:** ${confidence || 'medium'}\n\n`;
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
        } else if (!hasAnyProblems) {
            response += `### ✅ Nenhuma violação encontrada!\n`;
            response += `O código está em conformidade com as regras de negócio definidas.\n\n`;
        }

        // Seção: Implementado Corretamente
        if (implementedCorrectly && implementedCorrectly.length > 0) {
            response += `### ✅ Implementado Corretamente\n\n`;
            implementedCorrectly.forEach((item: string, index: number) => {
                response += `${index + 1}. ${item}\n`;
            });
            response += `\n`;
        }

        // Seção: Faltando ou Incompleto
        if (missingOrIncomplete && missingOrIncomplete.length > 0) {
            response += `### ❌ Faltando ou Incompleto\n\n`;
            missingOrIncomplete.forEach((item: any, index: number) => {
                response += `**${index + 1}. ${item.requirement}**\n`;
                response += `   📊 **Impacto:** ${item.impact}\n`;
                response += `   💡 **Sugestão:** ${item.suggestion}\n\n`;
            });
        }

        // Seção: Casos de Borda e Hipóteses
        if (edgeCasesAndAssumptions && edgeCasesAndAssumptions.length > 0) {
            response += `### ⚠️ Casos de Borda e Hipóteses\n\n`;
            edgeCasesAndAssumptions.forEach((item: any, index: number) => {
                response += `**${index + 1}. ${item.scenario}**\n`;
                response += `   🚨 **Risco:** ${item.risk}\n`;
                response += `   🛡️ **Recomendação:** ${item.recommendation}\n\n`;
            });
        }

        // Seção: Problemas de Lógica de Negócio
        if (businessLogicIssues && businessLogicIssues.length > 0) {
            response += `### 🎯 Problemas de Lógica de Negócio\n\n`;
            businessLogicIssues.forEach((issue: any, index: number) => {
                const severityIcon =
                    issue.severity === 'error'
                        ? '🔴'
                        : issue.severity === 'warning'
                          ? '🟡'
                          : '🔵';
                response += `${severityIcon} **${issue.severity?.toUpperCase()}** - ${issue.issue}\n`;
                response += `   🔧 **Correção:** ${issue.fix}\n\n`;
            });
        }

        response += `---\n*Análise realizada por Kodus AI Business Rules Validator*`;

        return response;
    }

    private async processCommand(
        commandType: CommandType,
        context: {
            prepareContext: any;
            organizationAndTeamData: OrganizationAndTeamData;
            repository: Repository;
            pullRequestNumber: number;
            thread: any;
        },
    ): Promise<string> {
        switch (commandType) {
            case CommandType.BUSINESS_LOGIC_VALIDATION:
                return await this.handleBusinessLogicValidation(context);
            case CommandType.CONVERSATION:
                return await this.handleConversation(context);
            default:
                return await this.handleConversation(context);
        }
    }

    private async handleBusinessLogicValidation(context: {
        prepareContext: any;
        organizationAndTeamData: OrganizationAndTeamData;
        repository: Repository;
        pullRequestNumber: number;
        thread: any;
    }): Promise<string> {
        // Passar a mensagem completa do usuário para o agent
        // O agent decidirá se precisa de mais informações
        const enrichedContext = {
            ...context,
            userMessage: context.prepareContext.userQuestion,
        };

        const validationResult =
            await this.businessRulesValidationAgentUseCase.execute(
                enrichedContext,
            );

        return this.formatValidationResponse(validationResult);
    }

    private async handleConversation(context: {
        prepareContext: any;
        organizationAndTeamData: OrganizationAndTeamData;
        thread: any;
    }): Promise<string> {
        const { prepareContext, organizationAndTeamData, thread } = context;

        return await this.conversationAgentUseCase.execute({
            prompt: prepareContext.userQuestion,
            organizationAndTeamData,
            prepareContext: prepareContext,
            thread: thread,
        });
    }
}
