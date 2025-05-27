import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { IBitbucketService } from '@/core/domain/bitbucket/contracts/bitbucket.service.contract';
import { IntegrationConfigEntity } from '@/core/domain/integrationConfigs/entities/integration-config.entity';
import { ICodeManagementService } from '@/core/domain/platformIntegrations/interfaces/code-management.interface';
import {
    PullRequests,
    PullRequestWithFiles,
    PullRequestCodeReviewTime,
    PullRequestFile,
    PullRequestReviewComment,
    OneSentenceSummaryItem,
    PullRequestsWithChangesRequested,
    PullRequestReviewState,
    ReactionsInComments,
    PullRequestAuthor,
} from '@/core/domain/platformIntegrations/types/codeManagement/pullRequests.type';
import { Repositories } from '@/core/domain/platformIntegrations/types/codeManagement/repositories.type';
import { PlatformType } from '@/shared/domain/enums/platform-type.enum';
import { IntegrationServiceDecorator } from '@/shared/utils/decorators/integration-service.decorator';
import { CodeManagementConnectionStatus } from '@/shared/utils/decorators/validate-code-management-integration.decorator';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../logger/pino.service';
import {
    IIntegrationConfigService,
    INTEGRATION_CONFIG_SERVICE_TOKEN,
} from '@/core/domain/integrationConfigs/contracts/integration-config.service.contracts';
import {
    AUTH_INTEGRATION_SERVICE_TOKEN,
    IAuthIntegrationService,
} from '@/core/domain/authIntegrations/contracts/auth-integration.service.contracts';
import {
    INTEGRATION_SERVICE_TOKEN,
    IIntegrationService,
} from '@/core/domain/integrations/contracts/integration.service.contracts';
import {
    IParametersService,
    PARAMETERS_SERVICE_TOKEN,
} from '@/core/domain/parameters/contracts/parameters.service.contract';
import { IntegrationConfigKey } from '@/shared/domain/enums/Integration-config-key.enum';
import { BitbucketAuthDetail } from '@/core/domain/authIntegrations/types/bitbucket-auth-detail.type';
import { AuthMode } from '@/core/domain/platformIntegrations/enums/codeManagement/authMode.enum';
import { APIClient, Bitbucket, Schema } from 'bitbucket';
import { v4 } from 'uuid';
import { IntegrationEntity } from '@/core/domain/integrations/entities/integration.entity';
import { IntegrationCategory } from '@/shared/domain/enums/integration-category.enum';
import { decrypt, encrypt } from '@/shared/utils/crypto';
import { PullRequestState } from '@/shared/domain/enums/pullRequestState.enum';
import { safelyParseMessageContent } from '@/shared/utils/safelyParseMessageContent';
import { PromptService } from '../prompt.service';
import moment from 'moment';
import { ParametersKey } from '@/shared/domain/enums/parameters-key.enum';
import { Commit } from '@/config/types/general/commit.type';
import {
    CommentResult,
    FileChange,
    Repository,
} from '@/config/types/general/codeReview.type';
import { Response as BitbucketResponse } from 'bitbucket/src/request/types';
import { CreateAuthIntegrationStatus } from '@/shared/domain/enums/create-auth-integration-status.enum';
import {
    IRepositoryManager,
    REPOSITORY_MANAGER_TOKEN,
} from '@/core/domain/repository/contracts/repository-manager.contract';
import { IRepository } from '@/core/domain/pullRequests/interfaces/pullRequests.interface';
import {
    KODY_CODE_REVIEW_COMPLETED_MARKER,
    KODY_CRITICAL_ISSUE_COMMENT_MARKER,
    KODY_START_COMMAND_MARKER,
} from '@/shared/utils/codeManagement/codeCommentMarkers';
import {
    MODEL_STRATEGIES,
    LLMModelProvider,
} from '../llmProviders/llmModelProvider.helper';
import { LLM_PROVIDER_SERVICE_TOKEN } from '../llmProviders/llmProvider.service.contract';
import { LLMProviderService } from '../llmProviders/llmProvider.service';
import { ConfigService } from '@nestjs/config';
import { AuthorContribution } from '@/core/domain/pullRequests/interfaces/authorContributor.interface';

@Injectable()
@IntegrationServiceDecorator(PlatformType.BITBUCKET, 'codeManagement')
export class BitbucketService
    implements
        IBitbucketService,
        Omit<
            ICodeManagementService,
            | 'getOrganizations'
            | 'getListOfValidReviews'
            | 'getUserByEmailOrName'
            | 'getPullRequestReviewThreads'
            | 'getUserById'
            | 'getDataForCalculateDeployFrequency'
            | 'getCommitsByReleaseMode'
            | 'getAuthenticationOAuthToken'
            | 'getRepositoryAllFiles'
        >
{
    constructor(
        @Inject(INTEGRATION_SERVICE_TOKEN)
        private readonly integrationService: IIntegrationService,

        @Inject(INTEGRATION_CONFIG_SERVICE_TOKEN)
        private readonly integrationConfigService: IIntegrationConfigService,

        @Inject(AUTH_INTEGRATION_SERVICE_TOKEN)
        private readonly authIntegrationService: IAuthIntegrationService,

        @Inject(PARAMETERS_SERVICE_TOKEN)
        private readonly parameterService: IParametersService,

        @Inject(REPOSITORY_MANAGER_TOKEN)
        private readonly repositoryManager: IRepositoryManager,

        @Inject(LLM_PROVIDER_SERVICE_TOKEN)
        private readonly llmProviderService: LLMProviderService,

        private readonly promptService: PromptService,

        private readonly logger: PinoLoggerService,

        private readonly configService: ConfigService,
    ) {}

    async getPullRequestAuthors(
        params: {
            organizationAndTeamData: OrganizationAndTeamData;
        },
    ): Promise<PullRequestAuthor[]> {
        try {
            const startDate = new Date();
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() - 60);

            const pullRequests =
                await this.getPullRequests({
                    organizationAndTeamData: params.organizationAndTeamData,
                    filters: {
                        startDate: endDate.toISOString(), // Reversing the dates to fetch the last 15 days
                        endDate: startDate.toISOString(),
                    },
                });

            // Group the PRs by author and count the contributions
            const authorContributions = pullRequests.reduce<
                Record<string, AuthorContribution>
            >((acc, pr) => {
                const authorId = pr.author_id;
                const authorName = pr.author_name;

                if (!authorId) {
                    this.logger.warn({
                        message: 'Skipping PR with missing author ID',
                        context: BitbucketService.name,
                        metadata: {
                            organizationAndTeamData:
                                params?.organizationAndTeamData,
                            pullRequest: pr?.pull_number,
                        },
                    });
                    return acc;
                }

                if (!acc[authorId]) {
                    acc[authorId] = {
                        id: authorId,
                        name: authorName,
                        contributions: 0,
                    };
                }

                acc[authorId].contributions++;
                return acc;
            }, {});

            // Convert to array and sort by number of contributions
            const sortedAuthors = Object.values<AuthorContribution>(
                authorContributions,
            ).sort((a, b) => a.name.localeCompare(b.name));

            return sortedAuthors.map((author) => ({
                id: this.sanitizeUUId(author.id.toString()),
                name: author.name,
            }));
        } catch (error) {
            this.logger.error({
                message: 'Error fetching pull request authors',
                context: BitbucketService.name,
                error,
                metadata: {
                    organizationAndTeamData: params?.organizationAndTeamData,
                },
            });
            throw error;
        }
    }

    async getPullRequestAuthors_OLD(params: {
        organizationAndTeamData: OrganizationAndTeamData;
    }): Promise<PullRequestAuthor[]> {
        try {
            const { organizationAndTeamData } = params;

            if (!organizationAndTeamData.organizationId) {
                return [];
            }

            const bitbucketAuthDetail = await this.getAuthDetails(
                organizationAndTeamData,
            );
            const repositories = <Repositories[]>(
                await this.findOneByOrganizationAndTeamDataAndConfigKey(
                    organizationAndTeamData,
                    IntegrationConfigKey.REPOSITORIES,
                )
            );

            if (!bitbucketAuthDetail || !repositories) {
                return [];
            }

            const bitbucketAPI = this.instanceBitbucketApi(bitbucketAuthDetail);
            const since = new Date();
            since.setDate(since.getDate() - 60);

            const authorsSet = new Set<string>();
            const authorsData = new Map<string, PullRequestAuthor>();

            const repoPromises = repositories.map(async (repo) => {
                try {
                    const prs = await bitbucketAPI.pullrequests
                        .list({
                            repo_slug: `{${repo.id}}`,
                            workspace: `{${repo.workspaceId}}`,
                            sort: '-created_on',
                            pagelen: 100,
                        })
                        .then((res) =>
                            this.getPaginatedResults(bitbucketAPI, res),
                        );

                    // Para na primeira contribuição de cada usuário
                    for (const pr of prs) {
                        if (new Date(pr.created_on) < since) continue;

                        if (pr.author?.uuid) {
                            const userId = this.sanitizeUUId(pr.author.uuid);

                            if (!authorsSet.has(userId)) {
                                authorsSet.add(userId);
                                authorsData.set(userId, {
                                    id: userId,
                                    name:
                                        (pr.author.display_name as string) ||
                                        (pr.author.nickname as string),
                                });
                            }
                        }
                    }
                } catch (error) {
                    this.logger.error({
                        message: 'Error in getPullRequestAuthors',
                        context: BitbucketService.name,
                        error: error,
                        metadata: {
                            organizationAndTeamData,
                            repositoryId: repo.id,
                        },
                    });
                }
            });

            await Promise.all(repoPromises);

            return Array.from(authorsData.values()).sort((a, b) =>
                a.name.localeCompare(b.name),
            );
        } catch (err) {
            this.logger.error({
                message: 'Error in getPullRequestAuthors',
                context: BitbucketService.name,
                error: err,
                metadata: {
                    organizationAndTeamData: params?.organizationAndTeamData,
                },
            });
            return [];
        }
    }
    async getPullRequestsWithChangesRequested(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: Partial<Repository>;
    }): Promise<PullRequestsWithChangesRequested[] | null> {
        try {
            const { organizationAndTeamData, repository } = params;

            const bitbucketAuthDetail = await this.getAuthDetails(
                organizationAndTeamData,
            );

            if (!bitbucketAuthDetail) {
                return null;
            }

            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                repository.id,
            );

            if (!workspace) {
                return null;
            }

            const bitbucketAPI = this.instanceBitbucketApi(bitbucketAuthDetail);

            // takes a while
            const activities: any[] = await bitbucketAPI.pullrequests
                .listActivitiesForRepo({
                    repo_slug: `{${repository.id}}`,
                    workspace: `{${workspace}}`,
                })
                .then((res) => this.getPaginatedResults(bitbucketAPI, res));

            return activities
                .filter((activity) => activity.changes_requested)
                .map((filteredActivity) => ({
                    title: filteredActivity.pull_request.title ?? '',
                    number: filteredActivity.pull_request.id,
                    reviewDecision: PullRequestReviewState.CHANGES_REQUESTED,
                    date: new Date(filteredActivity.changes_requested.date),
                }))
                .sort((a, b) => a.date.getTime() - b.date.getTime())
                .map(({ date, ...rest }) => rest);
        } catch (error) {
            this.logger.error({
                message: 'Error to get pull requests with changes requested',
                context: BitbucketService.name,
                serviceName:
                    'BitbucketService getPullRequestsWithChangesRequested',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async cloneRepository(params: {
        repository: Pick<
            Repository,
            'id' | 'defaultBranch' | 'fullName' | 'name'
        >;
        organizationAndTeamData: OrganizationAndTeamData;
    }): Promise<string> {
        try {
            const bitbucketAuthDetail = await this.getAuthDetails(
                params.organizationAndTeamData,
            );

            if (!bitbucketAuthDetail) {
                throw new BadRequestException('Installation not found');
            }
            // Construct the full Bitbucket URL
            const fullBitbucketUrl = `https://bitbucket.org/${params?.repository?.fullName}`;

            const repoPath = await this.repositoryManager.gitCloneWithAuth({
                organizationId: params?.organizationAndTeamData?.organizationId,
                repositoryId: params?.repository?.id,
                repositoryName: params?.repository?.name,
                url: fullBitbucketUrl,
                branch: params?.repository?.defaultBranch,
                provider: PlatformType.BITBUCKET,
                auth: {
                    type: bitbucketAuthDetail.authMode,
                    token: decrypt(bitbucketAuthDetail.appPassword),
                },
            });

            return repoPath;
        } catch (error) {
            this.logger.error({
                message: `Failed to clone repository ${params?.repository?.fullName} from Bitbucket`,
                context: BitbucketService.name,
                error: error.message,
                metadata: params,
            });
            return '';
        }
    }

    async getPullRequests(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        filters?: {
            startDate?: string;
            endDate?: string;
            assignFilter?: any;
            state?: PullRequestState;
            includeChanges?: boolean;
            pullRequestNumbers?: number[];
        };
    }): Promise<PullRequests[]> {
        try {
            const { organizationAndTeamData } = params;

            if (!organizationAndTeamData.organizationId) {
                return null;
            }

            const filters = params?.filters ?? {};

            const bitbucketAuthDetail = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const repositories = <Repositories[]>(
                await this.findOneByOrganizationAndTeamDataAndConfigKey(
                    organizationAndTeamData,
                    IntegrationConfigKey.REPOSITORIES,
                )
            );

            if (!bitbucketAuthDetail || !repositories) {
                return null;
            }

            const bitbucketAPI = this.instanceBitbucketApi(bitbucketAuthDetail);

            let pullRequests: Array<
                Schema.Pullrequest & { repository: string }
            > = [];

            const results = await Promise.all(
                repositories.map(async (repo) => {
                    const prs = await bitbucketAPI.pullrequests
                        .list({
                            repo_slug: `{${repo.id}}`,
                            workspace: `{${repo.workspaceId}}`,
                            fields: '+values.participants,+values.reviewers',
                        })
                        .then((res) =>
                            this.getPaginatedResults(bitbucketAPI, res),
                        );

                    return prs?.map((item) => ({
                        ...item,
                        repository: repo?.name,
                    }));
                }),
            );

            pullRequests = results.flat();

            if (filters && filters?.state === 'open') {
                pullRequests = pullRequests.filter((pr) => pr.state === 'OPEN');
            }

            const stateMap = {
                OPEN: PullRequestState.OPENED,
                MERGED: PullRequestState.CLOSED,
            };

            return pullRequests
                .sort((a, b) => {
                    return (
                        new Date(b.created_on).getTime() -
                        new Date(a.created_on).getTime()
                    );
                })
                .map((pr) => {
                    return {
                        id: pr.id?.toString(),
                        author_id: this.sanitizeUUId(
                            pr.author?.uuid?.toString(),
                        ),
                        author_name: pr.author?.display_name,
                        author_created_at: pr.created_on,
                        repository: pr?.repository,
                        repositoryId: this.sanitizeUUId(
                            pr?.source?.repository?.uuid,
                        ),
                        message: pr.summary?.raw,
                        state: stateMap[pr.state] || PullRequestState.ALL,
                        prURL: pr.links?.html?.href,
                        organizationId:
                            params?.organizationAndTeamData?.organizationId,
                        pull_number: pr.id,
                        number: pr.id,
                        body: pr.summary?.raw,
                        title: pr.title,
                        created_at: pr.created_on,
                        updated_at: pr.updated_on,
                        merged_at: pr.updated_on,
                        participants: pr.participants,
                        reviewers: pr.reviewers.map((reviewer) => ({
                            ...reviewer,
                            uuid: this.sanitizeUUId(reviewer.uuid),
                        })),
                        head: {
                            ref: pr.source?.branch?.name,
                            repo: {
                                id: this.sanitizeUUId(
                                    pr.source?.repository?.uuid,
                                ),
                                name: pr.source?.repository?.name,
                            },
                        },
                        base: {
                            ref: pr.destination?.branch?.name,
                        },
                        user: {
                            login: pr.author?.display_name ?? '',
                            name: pr.author?.display_name,
                            id: this.sanitizeUUId(pr.author?.uuid),
                        },
                    };
                });
        } catch (error) {
            this.logger.error({
                message: 'Error to get pull requests',
                context: BitbucketService.name,
                serviceName: 'BitbucketService getPullRequests',
                error: error,
                metadata: {
                    params,
                },
            });
            return [];
        }
    }

    async getPullRequestDetails(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { id: string; name: string };
        prNumber: number;
    }): Promise<any | null> {
        try {
            const { organizationAndTeamData, repository, prNumber } = params;

            if (
                !organizationAndTeamData.organizationId ||
                !repository.id ||
                !prNumber
            ) {
                return null;
            }

            const bitbucketAuthDetail = await this.getAuthDetails(
                organizationAndTeamData,
            );

            if (!bitbucketAuthDetail) {
                return null;
            }

            const bitbucketAPI = this.instanceBitbucketApi(bitbucketAuthDetail);

            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                repository.id,
            );

            if (!workspace) {
                return null;
            }

            const prDetails = (
                await bitbucketAPI.pullrequests.get({
                    repo_slug: `{${repository.id}}`,
                    workspace: `{${workspace}}`,
                    pull_request_id: prNumber,
                    fields: '+values.participants,+values.reviewers',
                })
            ).data;

            const prData = {
                id: prDetails.id.toString(),
                author_id: this.sanitizeUUId(
                    prDetails.author?.uuid?.toString(),
                ),
                author_name: prDetails.author?.display_name,
                repository: repository.name,
                repositoryId: this.sanitizeUUId(
                    prDetails.source?.repository?.uuid,
                ),
                message: prDetails.summary?.raw,
                state: prDetails.state,
                prURL: prDetails.links?.html?.href,
                organizationId: organizationAndTeamData.organizationId,
                pull_number: prDetails.id,
                number: prDetails.id,
                body: prDetails.summary?.raw,
                title: prDetails.title,
                created_at: prDetails.created_on,
                updated_at: prDetails.updated_on,
                merged_at: prDetails.updated_on,
                participants: prDetails.participants.map((participant) => ({
                    id: this.sanitizeUUId(participant.user.uuid),
                    approved: participant.approved,
                    state: participant.state,
                    type: participant.type,
                })),
                reviewers: prDetails.reviewers.map((reviewer) => ({
                    id: this.sanitizeUUId(reviewer.uuid),
                })),
                head: {
                    ref: prDetails.source?.branch?.name,
                    repo: {
                        id: this.sanitizeUUId(
                            prDetails.source?.repository?.uuid,
                        ),
                        name: prDetails.source?.repository?.name,
                    },
                },
                base: {
                    ref: prDetails.destination?.branch?.name,
                },
                user: {
                    login: prDetails.author?.display_name ?? '',
                    name: prDetails.author?.display_name,
                    id: this.sanitizeUUId(prDetails.author?.uuid),
                },
            };

            return prData;
        } catch (error) {
            this.logger.error({
                message: 'Error to get pull request details',
                context: BitbucketService.name,
                serviceName: 'BitbucketService getPullRequestDetails',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async getRepositories(params: {
        organizationAndTeamData: OrganizationAndTeamData;
    }): Promise<Repositories[]> {
        try {
            const { organizationAndTeamData } = params;

            const bitbucketAuthDetail = await this.getAuthDetails(
                organizationAndTeamData,
            );

            if (!bitbucketAuthDetail) {
                return [];
            }

            const integration = await this.integrationService.findOne({
                organization: {
                    uuid: organizationAndTeamData.organizationId,
                },
                team: {
                    uuid: organizationAndTeamData.teamId,
                },
                platform: PlatformType.BITBUCKET,
            });

            const integrationConfig =
                await this.integrationConfigService.findOne({
                    integration: { uuid: integration?.uuid },
                    configKey: IntegrationConfigKey.REPOSITORIES,
                    team: { uuid: organizationAndTeamData.teamId },
                });

            const bitbucketAPI = this.instanceBitbucketApi(bitbucketAuthDetail);

            const workspaces = await bitbucketAPI.workspaces
                .getWorkspaces({})
                .then((res) => this.getPaginatedResults(bitbucketAPI, res));

            const workspacesWithRepos = await Promise.all(
                workspaces.map((workspace) =>
                    bitbucketAPI.repositories
                        .list({
                            workspace: `${workspace.uuid}`,
                        })
                        .then((res) =>
                            this.getPaginatedResults(bitbucketAPI, res),
                        )
                        .then((res) => ({ workspace, repos: res })),
                ),
            );

            const repositories = workspacesWithRepos.reduce<Repositories[]>(
                (acc, { workspace, repos }) => {
                    repos.forEach((repo) => {
                        acc.push(
                            this.transformRepo(
                                repo,
                                workspace,
                                integrationConfig,
                            ),
                        );
                    });
                    return acc;
                },
                [],
            );

            return repositories;
        } catch (error) {
            this.logger.error({
                message: 'Error to get repositories',
                context: BitbucketService.name,
                serviceName: 'BitbucketService getRepositories',
                error: error,
                metadata: {
                    params,
                },
            });
            throw new BadRequestException(error);
        }
    }

    private transformRepo(
        repo: Schema.Repository,
        workspace: Schema.Workspace,
        integrationConfig: IntegrationConfigEntity,
    ): Repositories {
        const { uuid, name, links, is_private, mainbranch, project } = repo;
        const { slug, uuid: workspaceUuid } = workspace;

        return {
            id: this.sanitizeUUId(uuid),
            name: name ?? '',
            http_url: links?.html?.href ?? '',
            avatar_url: links?.avatar?.href ?? '',
            organizationName: slug ?? '',
            visibility: is_private ? 'private' : 'public',
            selected:
                integrationConfig?.configValue?.some(
                    (repository) => repository?.name === name,
                ) ?? false,
            default_branch: mainbranch?.name ?? '',
            workspaceId: this.sanitizeUUId(workspaceUuid),
            project: {
                id: this.sanitizeUUId(project?.uuid),
                name: project?.name ?? '',
            },
        };
    }

    async getWorkflows(organizationAndTeamData: OrganizationAndTeamData) {
        try {
            const bitbucketAuthDetail = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const repositories = <Repositories[]>(
                await this.findOneByOrganizationAndTeamDataAndConfigKey(
                    organizationAndTeamData,
                    IntegrationConfigKey.REPOSITORIES,
                )
            );

            if (!bitbucketAuthDetail || !repositories) {
                return [];
            }

            const bitbucketAPI = this.instanceBitbucketApi(bitbucketAuthDetail);

            const allWorkflows = await Promise.all(
                repositories.map((repo) =>
                    bitbucketAPI.pipelines
                        .list({
                            repo_slug: `{${repo.id}}`,
                            workspace: `{${repo.workspaceId}}`,
                        })
                        .then((res) =>
                            this.getPaginatedResults(bitbucketAPI, res),
                        )
                        .then((res) => ({ repo, workflows: res })),
                ),
            );

            const workflows = allWorkflows.filter(
                ({ workflows }) => workflows.length > 0,
            );

            if (!workflows || workflows.length === 0) {
                return [];
            }

            let llm = this.llmProviderService.getLLMProvider({
                model: MODEL_STRATEGIES[LLMModelProvider.OPENAI_GPT_4O]
                    .modelName,
                temperature: 0,
                jsonMode: true,
            });

            const promptWorkflows =
                await this.promptService.getCompleteContextPromptByName(
                    'prompt_getProductionWorkflows',
                    {
                        organizationAndTeamData,
                        payload: JSON.stringify(workflows),
                        promptIsForChat: false,
                    },
                );

            const chain = await llm.invoke(
                await promptWorkflows.format({
                    organizationAndTeamData,
                    payload: JSON.stringify(workflows),
                    promptIsForChat: false,
                }),
                {
                    metadata: {
                        module: 'Setup',
                        submodule: 'GetProductionDeployment',
                    },
                },
            );
            return safelyParseMessageContent(chain.content).repos;
        } catch (error) {
            this.logger.error({
                message: 'Error to get workflows',
                context: BitbucketService.name,
                serviceName: 'BitbucketService getWorkflows',
                error: error,
                metadata: {
                    organizationAndTeamData,
                },
            });
            return [];
        }
    }

    async getListMembers(params: {
        organizationAndTeamData: OrganizationAndTeamData;
    }): Promise<{ name: string; id: string | number }[]> {
        try {
            const { organizationAndTeamData } = params;

            const bitbucketAuthDetail = await this.getAuthDetails(
                organizationAndTeamData,
            );

            if (!bitbucketAuthDetail) {
                return [];
            }

            const repositories = <Repositories[]>(
                await this.findOneByOrganizationAndTeamDataAndConfigKey(
                    organizationAndTeamData,
                    IntegrationConfigKey.REPOSITORIES,
                )
            );

            const bitbucketAPI = this.instanceBitbucketApi(bitbucketAuthDetail);

            const allPermissions = await Promise.all(
                repositories.map((repo) =>
                    bitbucketAPI.repositories
                        .listUserPermissions({
                            repo_slug: `{${repo.id}}`,
                            workspace: `{${repo.workspaceId}}`,
                        })
                        .then((res) =>
                            this.getPaginatedResults(bitbucketAPI, res),
                        ),
                ),
            );

            const uniqueMembers = new Set<{
                name: string;
                id: string | number;
            }>();

            allPermissions.forEach((permissions) => {
                permissions.forEach((permission) => {
                    uniqueMembers.add({
                        name: permission.user.display_name,
                        id: this.sanitizeUUId(permission.user.uuid),
                    });
                });
            });

            return Array.from(uniqueMembers);
        } catch (error) {
            this.logger.error({
                message: 'Error to get list members',
                context: BitbucketService.name,
                serviceName: 'BitbucketService getListMembers',
                error: error,
                metadata: {
                    params,
                },
            });
            return [];
        }
    }

    async verifyConnection(params: {
        organizationAndTeamData: OrganizationAndTeamData;
    }): Promise<CodeManagementConnectionStatus> {
        try {
            const { organizationAndTeamData } = params;

            if (!organizationAndTeamData.organizationId)
                return {
                    platformName: PlatformType.BITBUCKET,
                    isSetupComplete: false,
                    hasConnection: false,
                    config: {},
                };

            const [bitbucketRepositories, bitbucketOrg] = await Promise.all([
                this.findOneByOrganizationAndTeamDataAndConfigKey(
                    organizationAndTeamData,
                    IntegrationConfigKey.REPOSITORIES,
                ),
                this.integrationService.findOne({
                    organization: {
                        uuid: organizationAndTeamData.organizationId,
                    },
                    status: true,
                    platform: PlatformType.BITBUCKET,
                }),
            ]);

            const hasRepositories = bitbucketRepositories?.length > 0;

            const authMode = bitbucketOrg?.authIntegration?.authDetails
                ?.authMode
                ? bitbucketOrg?.authIntegration?.authDetails?.authMode
                : AuthMode.TOKEN;

            const isSetupComplete =
                hasRepositories &&
                authMode === AuthMode.TOKEN &&
                !!bitbucketOrg?.authIntegration?.authDetails?.appPassword;

            return {
                platformName: PlatformType.BITBUCKET,
                isSetupComplete,
                hasConnection: !!bitbucketOrg,
                config: {
                    hasRepositories: hasRepositories,
                    status: bitbucketRepositories?.installationStatus,
                },
                category: IntegrationCategory.CODE_MANAGEMENT,
            };
        } catch (err) {
            this.logger.error({
                message: 'Error to verify connection',
                context: BitbucketService.name,
                serviceName: 'BitbucketService verifyConnection',
                error: err,
                metadata: {
                    params,
                },
            });
            throw new BadRequestException(err);
        }
    }

    async predictDeploymentType(params: {
        organizationAndTeamData: OrganizationAndTeamData;
    }) {
        const { organizationAndTeamData } = params;
        try {
            const workflows = await this.getWorkflows(organizationAndTeamData);

            if (workflows && workflows.length > 0) {
                return this.formatDeploymentTypeFromDeploy(workflows);
            }

            const deployments = await this.getDeployments(
                organizationAndTeamData,
            );

            if (deployments && deployments.length > 0) {
                return {
                    type: 'releases',
                    madeBy: 'Kody',
                };
            }

            const prs = await this.getPullRequests({
                organizationAndTeamData,
                filters: {
                    startDate: moment()
                        .subtract(90, 'days')
                        .format('YYYY-MM-DD'),
                    endDate: moment().format('YYYY-MM-DD'),
                },
            });

            if (prs && prs.length > 0) {
                return {
                    type: 'PRs',
                    madeBy: 'Kody',
                };
            }
        } catch (error) {
            this.logger.error({
                message: 'Error to predict deployment type',
                context: BitbucketService.name,
                serviceName: 'PredictDeploymentType',
                error: error,
                metadata: {
                    teamId: organizationAndTeamData.teamId,
                },
            });
            return null;
        }
    }

    private async getDeployments(
        organizationAndTeamData: OrganizationAndTeamData,
    ) {
        try {
            const bitbucketAuthDetail = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const repositories = <Repositories[]>(
                await this.findOneByOrganizationAndTeamDataAndConfigKey(
                    organizationAndTeamData,
                    IntegrationConfigKey.REPOSITORIES,
                )
            );

            if (!bitbucketAuthDetail || !repositories) {
                return null;
            }

            const bitbucketAPI = this.instanceBitbucketApi(bitbucketAuthDetail);

            const allDeployments = await Promise.all(
                repositories.map((repo) =>
                    bitbucketAPI.deployments
                        .list({
                            repo_slug: `{${repo.id}}`,
                            workspace: `{${repo.workspaceId}}`,
                        })
                        .then((res) =>
                            this.getPaginatedResults(bitbucketAPI, res),
                        ),
                ),
            );

            const deployments = allDeployments.filter(
                (deployment) => deployment.length > 0,
            );

            return deployments;
        } catch (error) {
            this.logger.error({
                message: 'Error to get deployments',
                context: BitbucketService.name,
                serviceName: 'BitbucketService getDeployments',
                error: error,
                metadata: {
                    organizationAndTeamData,
                },
            });
            return [];
        }
    }

    private formatDeploymentTypeFromDeploy(workflows) {
        return {
            type: 'deployment',
            madeBy: 'Kody',
            value: {
                workflows: workflows.flatMap((repo) =>
                    repo.productionWorkflows.map((workflow) => ({
                        id: workflow.id,
                        name: workflow.name,
                        repo: repo.repo,
                    })),
                ),
            },
        };
    }

    async savePredictedDeploymentType(params: {
        organizationAndTeamData: OrganizationAndTeamData;
    }) {
        try {
            const integration = await this.integrationService.findOne({
                organization: {
                    uuid: params.organizationAndTeamData.organizationId,
                },
                team: {
                    uuid: params.organizationAndTeamData.teamId,
                },
                platform: PlatformType.BITBUCKET,
            });

            if (!integration) {
                return null;
            }

            const deploymentType = await this.predictDeploymentType(params);

            if (!deploymentType) {
                return null;
            }

            return await this.parameterService.createOrUpdateConfig(
                ParametersKey.DEPLOYMENT_TYPE,
                deploymentType,
                params.organizationAndTeamData,
            );
        } catch (error) {
            this.logger.error({
                message: 'Error to save predicted deployment type',
                context: BitbucketService.name,
                serviceName: 'BitbucketService savePredictedDeploymentType',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async getPullRequestsWithFiles(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        filters?: any;
    }): Promise<PullRequestWithFiles[] | null> {
        try {
            const { organizationAndTeamData } = params;

            const filters = params?.filters ?? {};
            const { prStatus } = filters ?? 'OPEN';

            const stateMap = {
                open: PullRequestState.OPENED.toUpperCase(),
                closed: 'DECLINED',
                merged: PullRequestState.MERGED.toUpperCase(),
            };

            // Normalize the input to lowercase and look it up in the stateMap
            const normalizedStatus =
                stateMap[prStatus.toLowerCase()] || PullRequestState.OPENED; // Default to OPENED if not found

            const { startDate, endDate } = filters?.period || {};

            const bitbucketAuthDetail = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const repositories = <Repositories[]>(
                await this.findOneByOrganizationAndTeamDataAndConfigKey(
                    organizationAndTeamData,
                    IntegrationConfigKey.REPOSITORIES,
                )
            );

            if (!bitbucketAuthDetail || !repositories) {
                return null;
            }

            const bitbucketAPI = this.instanceBitbucketApi(bitbucketAuthDetail);

            const reposWithPrs = await Promise.all(
                repositories.map(async (repo) => {
                    let prs = await bitbucketAPI.pullrequests
                        .list({
                            repo_slug: `{${repo.id}}`,
                            workspace: `{${repo.workspaceId}}`,
                            state: normalizedStatus,
                        })
                        .then((res) =>
                            this.getPaginatedResults(bitbucketAPI, res),
                        );

                    if (startDate && endDate) {
                        const start = new Date(startDate);
                        const end = new Date(endDate);

                        prs = prs.filter((pr) => {
                            const createdOn = new Date(pr.created_on);
                            return createdOn >= start && createdOn <= end;
                        });
                    }

                    return { repo, prs };
                }),
            );

            const pullRequestsWithFiles: PullRequestWithFiles[] = [];

            await Promise.all(
                reposWithPrs.map(async ({ repo, prs }) => {
                    const prsWithDiffs = await Promise.all(
                        prs.map((pr) =>
                            bitbucketAPI.pullrequests
                                .getDiffStat({
                                    pull_request_id: pr.id,
                                    repo_slug: `{${repo.id}}`,
                                    workspace: `{${repo.workspaceId}}`,
                                })
                                .then((res) =>
                                    this.getPaginatedResults<Schema.Diffstat>(
                                        bitbucketAPI,
                                        res,
                                    ),
                                )
                                .then((res) => ({ pr, diffs: res })),
                        ),
                    );

                    const prsWithFiles: PullRequestWithFiles[] =
                        prsWithDiffs.map(({ pr, diffs }) => {
                            const pullRequestFiles: PullRequestFile[] =
                                diffs.map((diff) => ({
                                    additions: diff.lines_added,
                                    changes:
                                        diff.lines_added + diff.lines_removed,
                                    deletions: diff.lines_removed,
                                    status: diff.status,
                                }));

                            return {
                                id: pr.id,
                                pull_number: pr.id,
                                state: pr.state,
                                title: pr.title,
                                repository: {
                                    id: repo.id,
                                    name: repo.name,
                                },
                                pullRequestFiles,
                            };
                        });

                    pullRequestsWithFiles.push(...prsWithFiles);
                }),
            );

            return pullRequestsWithFiles;
        } catch (error) {
            this.logger.error({
                message: 'Error to get pull requests with files',
                context: BitbucketService.name,
                serviceName: 'BitbucketService getPullRequestsWithFiles',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async getPullRequestsForRTTM(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        filters?: any;
    }): Promise<PullRequestCodeReviewTime[] | null> {
        try {
            const { organizationAndTeamData } = params;

            const filters = params?.filters ?? {};
            const { startDate, endDate } = filters?.period || {};

            const bitbucketAuthDetail = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const repositories = <Repositories[]>(
                await this.findOneByOrganizationAndTeamDataAndConfigKey(
                    organizationAndTeamData,
                    IntegrationConfigKey.REPOSITORIES,
                )
            );

            if (!bitbucketAuthDetail || !repositories) {
                return null;
            }

            const bitbucketAPI = this.instanceBitbucketApi(bitbucketAuthDetail);

            const query =
                startDate && endDate
                    ? ` AND updated_on >= ${startDate} AND updated_on <= ${endDate}`
                    : '';

            const mergedPullRequests = await Promise.all(
                repositories.map((repo) =>
                    bitbucketAPI.pullrequests
                        .list({
                            repo_slug: `{${repo.id}}`,
                            workspace: `{${repo.workspaceId}}`,
                            q: `(state = 'MERGED' OR state = 'DECLINED')${query}`,
                        })
                        .then((res) =>
                            this.getPaginatedResults(bitbucketAPI, res),
                        ),
                ),
            );

            const formattedPullRequests: PullRequestCodeReviewTime[] =
                mergedPullRequests.flatMap((prs) =>
                    prs.map((pr) => ({
                        id: pr.id,
                        created_at: pr.created_on,
                        closed_at: pr.updated_on,
                    })),
                );

            return formattedPullRequests;
        } catch (error) {
            this.logger.error({
                message: 'Error to get pull requests for RTTM',
                context: BitbucketService.name,
                serviceName: 'BitbucketService getPullRequestsForRTTM',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async getCommits(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        filters?: any;
    }): Promise<Commit[]> {
        try {
            const { organizationAndTeamData } = params;

            const filters = params?.filters ?? {};

            const bitbucketAuthDetail = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const repositories = <Repositories[]>(
                await this.findOneByOrganizationAndTeamDataAndConfigKey(
                    organizationAndTeamData,
                    IntegrationConfigKey.REPOSITORIES,
                )
            );

            if (!bitbucketAuthDetail || !repositories) {
                return null;
            }

            const bitbucketAPI = this.instanceBitbucketApi(bitbucketAuthDetail);

            const { startDate, endDate } = filters || {};

            const commitsByRepo = await Promise.all(
                repositories.map((repo) =>
                    bitbucketAPI.commits
                        .list({
                            repo_slug: `{${repo.id}}`,
                            workspace: `{${repo.workspaceId}}`,
                        })
                        .then((res) =>
                            this.getPaginatedResults(bitbucketAPI, res),
                        ),
                ),
            );

            const filteredCommits = commitsByRepo.flatMap((commits) =>
                commits.filter(
                    (commit) =>
                        (!startDate || new Date(commit.date) >= startDate) &&
                        (!endDate || new Date(commit.date) <= endDate),
                ),
            );

            const formattedCommits: Commit[] = filteredCommits.map((commit) => {
                const [name, email] = this.extractUsernameEmail(commit?.author);

                return {
                    sha: commit.hash,
                    commit: {
                        author: {
                            id: this.sanitizeUUId(commit.author?.user?.uuid),
                            name,
                            email,
                            date: commit.date,
                        },
                        message: commit.message,
                    },
                };
            });

            const sortedCommits = formattedCommits.sort(
                (a, b) =>
                    new Date(b.commit.author.date).getTime() -
                    new Date(a.commit.author.date).getTime(),
            );

            return sortedCommits;
        } catch (error) {
            this.logger.error({
                message: 'Error to get commits',
                context: BitbucketService.name,
                serviceName: 'BitbucketService getCommits',
                error: error,
                metadata: {
                    params,
                },
            });
            return [];
        }
    }

    async getFilesByPullRequestId(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { name: string; id: string };
        prNumber: number;
    }): Promise<FileChange[] | null> {
        try {
            const { organizationAndTeamData, repository, prNumber } = params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            if (!bitbucketAuthDetails) {
                return null;
            }

            const repo = await this.getRepoById(
                organizationAndTeamData,
                repository.id,
            );

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            const pr = await bitbucketAPI.pullrequests
                .get({
                    pull_request_id: prNumber,
                    repo_slug: `{${repo.id}}`,
                    workspace: `{${repo.workspaceId}}`,
                })
                .then((res) => res.data);

            const prFiles = await bitbucketAPI.pullrequests
                .getDiffStat({
                    pull_request_id: prNumber,
                    repo_slug: `{${repo.id}}`,
                    workspace: `{${repo.workspaceId}}`,
                })
                .then((res) =>
                    this.getPaginatedResults<Schema.Diffstat>(
                        bitbucketAPI,
                        res,
                    ),
                );

            const prFilesWithDiffAndContents = await Promise.all(
                prFiles
                    .filter((file) => file.new?.path)
                    .map(async (file) => ({
                        ...file,
                        contents: await bitbucketAPI.source
                            .read({
                                repo_slug: `{${repo.id}}`,
                                workspace: `{${repo.workspaceId}}`,
                                commit: pr.source?.commit?.hash,
                                path: file.new?.path,
                            })
                            .then((res) => res.data as string),
                        diff: await bitbucketAPI.commits
                            .getDiff({
                                repo_slug: `{${repo.id}}`,
                                workspace: `{${repo.workspaceId}}`,
                                spec: `${pr.source?.commit?.hash}..${pr.destination?.commit?.hash}`,
                                path: file.new?.path,
                            })
                            .then((res) =>
                                this.convertDiff(res.data as string),
                            ),
                    })),
            );

            return prFilesWithDiffAndContents.map((file) => ({
                filename: file.new?.path,
                sha: pr.source?.commit?.hash,
                status: file.status,
                additions: file.lines_added,
                deletions: file.lines_removed,
                changes: file.lines_added + file.lines_removed,
                patch: file.diff,
                blob_url: null,
                content: file.contents,
                contents_url: null,
                raw_url: null,
            }));
        } catch (error) {
            this.logger.error({
                message: `Error to get files by pull request id: ${params?.prNumber}`,
                context: BitbucketService.name,
                serviceName: 'BitbucketService getFilesByPullRequestId',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async getChangedFilesSinceLastCommit(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { name: string; id: string };
        prNumber: number;
        lastCommit: any;
    }): Promise<FileChange[] | null> {
        const { organizationAndTeamData, repository, prNumber, lastCommit } =
            params;

        try {
            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );
            if (!bitbucketAuthDetails) return null;

            const repo = await this.getRepoById(
                organizationAndTeamData,
                repository.id,
            );
            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            // 🔍 Pega o estado atual do PR
            const pr = await bitbucketAPI.pullrequests
                .get({
                    pull_request_id: prNumber,
                    repo_slug: `{${repo.id}}`,
                    workspace: `{${repo.workspaceId}}`,
                })
                .then((res) => res.data);

            // 📄 Lista todos os arquivos tocados no PR até agora
            const allFilesInPR = await bitbucketAPI.pullrequests
                .getDiffStat({
                    pull_request_id: prNumber,
                    repo_slug: `{${repo.id}}`,
                    workspace: `{${repo.workspaceId}}`,
                })
                .then((res) =>
                    this.getPaginatedResults<Schema.Diffstat>(
                        bitbucketAPI,
                        res,
                    ),
                );

            // ⚙️ Processa apenas arquivos que realmente mudaram desde o último commit
            const changedFiles = await Promise.all(
                allFilesInPR.map(async (file) => {
                    const path = file.new?.path;
                    if (!path) {
                        return null;
                    }

                    const diff = await bitbucketAPI.commits
                        .getDiff({
                            repo_slug: `{${repo.id}}`,
                            workspace: `{${repo.workspaceId}}`,
                            spec: `${pr.source?.commit?.hash}..${lastCommit.sha}`,
                            path,
                        })
                        .then((res) => res.data as string);

                    if (!diff?.trim()) {
                        return null;
                    }

                    const content = await bitbucketAPI.source
                        .read({
                            repo_slug: `{${repo.id}}`,
                            workspace: `{${repo.workspaceId}}`,
                            commit: pr.source?.commit?.hash,
                            path,
                        })
                        .then((res) => res.data as string);

                    return {
                        filename: path,
                        sha: pr.source?.commit?.hash,
                        status: file.status,
                        additions: file.lines_added,
                        deletions: file.lines_removed,
                        changes: file.lines_added + file.lines_removed,
                        patch: diff,
                        content,
                        blob_url: null,
                        contents_url: null,
                        raw_url: null,
                    };
                }),
            );

            return changedFiles.filter(Boolean);
        } catch (error) {
            this.logger.error({
                message:
                    'Error to get incremental changed files since last commit',
                context: BitbucketService.name,
                serviceName: 'getIncrementalChangedFilesSinceLastCommit',
                error,
                metadata: { params },
            });
            return null;
        }
    }

    async createReviewComment(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: any;
        prNumber: number;
        lineComment: any;
        commit: any;
        language: string;
    }): Promise<any | null> {
        try {
            const {
                organizationAndTeamData,
                repository,
                prNumber,
                lineComment,
                commit,
                language,
            } = params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            if (!bitbucketAuthDetails) {
                return null;
            }
            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                repository.id,
            );

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            const severityText = lineComment?.suggestion
                ? lineComment.suggestion.severity
                : '';
            const labelText = lineComment?.suggestion
                ? lineComment.suggestion.label
                : '';

            const bodyFormatted =
                `\`kody|code-review\` \`${labelText}\` \`severity-level|${severityText}\`\n\n` +
                `\`\`\`${repository?.language?.toLowerCase()}\n` +
                `${lineComment?.body?.improvedCode}\n` +
                `\`\`\`\n` +
                `${lineComment?.body?.suggestionContent}\n\n\n\n` +
                `${lineComment?.body?.actionStatement ? `${lineComment?.body?.actionStatement}\n\n\n\n` : ''}` +
                `Was this suggestion helpful? reply with 👍 or 👎 to help Kody learn from this interaction.\n`;

            const thumbsUpBlock = `\`\`\`\n👍\n\`\`\`\n`;
            const thumbsDownBlock = `\`\`\`\n👎\n\`\`\`\n`;

            const updatedBodyFormatted =
                bodyFormatted + thumbsUpBlock + thumbsDownBlock;

            // added ts-ignore because _body expects a type property but Bitbucket rejects it
            const comment = await bitbucketAPI.pullrequests
                .createComment({
                    pull_request_id: prNumber,
                    repo_slug: `{${repository.id}}`,
                    workspace: `{${workspace}}`,
                    // @ts-ignore
                    _body: {
                        content: {
                            raw: updatedBodyFormatted,
                        },
                        inline: {
                            path: lineComment?.path,
                            to: this.sanitizeLine(
                                params.lineComment.start_line ??
                                    params.lineComment.line,
                            ),
                        },
                    },
                })
                .then((res) => res.data);

            this.logger.log({
                message: `Created line comment for PR#${prNumber}`,
                context: BitbucketService.name,
                serviceName: 'BitbucketService createReviewComment',
                metadata: {
                    params,
                },
            });

            return comment;
        } catch (error) {
            this.logger.error({
                message: 'Error to create review comment',
                context: BitbucketService.name,
                serviceName: 'BitbucketService createReviewComment',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    private sanitizeLine(line: string | number): number {
        return typeof line === 'string' ? parseInt(line, 10) : line;
    }

    async createCommentInPullRequest(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: Partial<IRepository>;
        prNumber: number;
        body: string;
    }): Promise<any | null> {
        try {
            const { organizationAndTeamData, repository, prNumber, body } =
                params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            if (!bitbucketAuthDetails) {
                return null;
            }

            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                repository.id,
            );

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            // added ts-ignore because _body expects a type property but Bitbucket rejects it
            const comment = await bitbucketAPI.pullrequests
                .createComment({
                    pull_request_id: prNumber,
                    repo_slug: `{${repository.id}}`,
                    workspace: `{${workspace}}`,
                    // @ts-ignore
                    _body: {
                        content: {
                            raw: body,
                        },
                    },
                })
                .then((res) => res.data);

            this.logger.log({
                message: `Created line comment for PR#${prNumber}`,
                context: BitbucketService.name,
                serviceName: 'BitbucketService createReviewComment',
                metadata: {
                    params,
                },
            });

            return comment;
        } catch (error) {
            this.logger.error({
                message: 'Error to create review comment',
                context: BitbucketService.name,
                serviceName: 'BitbucketService createReviewComment',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async getRepositoryContentFile(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { name: string; id: string };
        file: any;
        pullRequest: any;
    }): Promise<any | null> {
        try {
            const { organizationAndTeamData, repository, file, pullRequest } =
                params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            if (!bitbucketAuthDetails) {
                return null;
            }

            const repo = await this.getRepoById(
                organizationAndTeamData,
                repository.id,
            );

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            const commits = await bitbucketAPI.repositories
                .listCommits({
                    repo_slug: `{${repo.id}}`,
                    workspace: `{${repo.workspaceId}}`,
                    include:
                        pullRequest.head?.ref || pullRequest.base?.ref || '',
                })
                .then((res) => this.getPaginatedResults(bitbucketAPI, res));

            const commit = commits[0];

            const fileContent = await bitbucketAPI.source
                .read({
                    commit: commit.hash,
                    path: file.filename,
                    repo_slug: `{${repo.id}}`,
                    workspace: `{${repo.workspaceId}}`,
                })
                .then((res) => res.data as string);

            return {
                data: {
                    content: fileContent,
                    encoding: '',
                },
            };
        } catch (error) {
            this.logger.error({
                message: 'Error to get repository content file',
                context: BitbucketService.name,
                serviceName: 'BitbucketService getRepositoryContentFile',
                error: error,
                metadata: {
                    params,
                },
            });
        }
    }

    async getPullRequestByNumber(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { name: string; id: string };
        prNumber: number;
    }): Promise<PullRequests | null> {
        try {
            const { organizationAndTeamData, repository, prNumber } = params;

            const pullRequests = await this.getPullRequests({
                organizationAndTeamData,
            });

            return pullRequests.find((pr) => pr.id === prNumber.toString());
        } catch (error) {
            this.logger.error({
                message: 'Error to get pull request by number',
                context: BitbucketService.name,
                serviceName: 'BitbucketService getPullRequestByNumber',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async getCommitsForPullRequestForCodeReview(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { name: string; id: string };
        prNumber: number;
    }): Promise<any[] | null> {
        try {
            const { organizationAndTeamData, repository, prNumber } = params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            if (!bitbucketAuthDetails) {
                return null;
            }

            const repo = await this.getRepoById(
                organizationAndTeamData,
                repository.id,
            );

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            const commits = await bitbucketAPI.pullrequests
                .listCommits({
                    pull_request_id: prNumber,
                    repo_slug: `{${repo.id}}`,
                    workspace: `{${repo.workspaceId}}`,
                })
                .then((res) =>
                    this.getPaginatedResults<Schema.Commit>(bitbucketAPI, res),
                );

            return commits
                .map((commit) => {
                    const [name, email] = this.extractUsernameEmail(
                        commit?.author,
                    );

                    return {
                        sha: commit?.hash,
                        message: commit?.message,
                        created_at: commit?.date,
                        author: {
                            id: this.sanitizeUUId(commit?.author?.user?.uuid),
                            username: commit?.author?.user?.nickname,
                            name,
                            email,
                            date: commit?.date,
                        },
                    };
                })
                .sort(
                    (a, b) =>
                        new Date(a?.created_at).getTime() -
                        new Date(b?.created_at).getTime(),
                );
        } catch (error) {
            this.logger.error({
                message:
                    'Error to get commits for pull request for code review',
                context: BitbucketService.name,
                serviceName:
                    'BitbucketService getCommitsForPullRequestForCodeReview',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async createIssueComment(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { name: string; id: string };
        prNumber: number;
        body: any;
    }): Promise<any | null> {
        try {
            const { organizationAndTeamData, repository, prNumber, body } =
                params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                repository.id,
            );

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            // added ts-ignore because _body expects a type property but Bitbucket rejects it
            const comment = await bitbucketAPI.pullrequests
                .createComment({
                    pull_request_id: prNumber,
                    repo_slug: `{${repository.id}}`,
                    workspace: `{${workspace}}`,
                    // @ts-ignore
                    _body: {
                        content: {
                            raw: body,
                        },
                    },
                })
                .then((res) => res.data);

            this.logger.log({
                message: `Created issue comment for PR#${prNumber}`,
                context: BitbucketService.name,
                serviceName: 'BitbucketService createIssueComment',
                metadata: {
                    params,
                },
            });

            return comment;
        } catch (error) {
            this.logger.error({
                message: 'Error to create issue comment',
                context: BitbucketService.name,
                serviceName: 'BitbucketService createIssueComment',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async createSingleIssueComment(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { name: string; id: string };
        prNumber: number;
        body: string;
    }): Promise<any | null> {
        const { organizationAndTeamData, repository, prNumber, body } = params;

        try {
            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );
            if (!bitbucketAuthDetails) return null;

            const repo = await this.getRepoById(
                organizationAndTeamData,
                repository.id,
            );
            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            const response = await bitbucketAPI.pullrequests.createComment({
                pull_request_id: prNumber,
                repo_slug: `{${repo.id}}`,
                workspace: `{${repo.workspaceId}}`,
                // @ts-ignore
                _body: {
                    content: {
                        raw: body,
                    },
                },
            });

            const commentData = response?.data;

            if (!commentData?.id) {
                throw new Error(`Failed to create comment in PR#${prNumber}`);
            }
            this.logger.log({
                message: `Created issue comment for PR#${prNumber}`,
                context: this.createSingleIssueComment.name,
                metadata: { params },
            });

            return {
                id: commentData.id,
                threadId: commentData.id,
                content: commentData.content?.raw,
                createdAt: commentData.created_on,
                author: {
                    id: commentData.user?.uuid,
                    username: commentData.user?.nickname,
                    name: commentData.user?.display_name,
                },
            };
        } catch (error) {
            this.logger.error({
                message: 'Error creating single issue comment on Bitbucket',
                context: this.createSingleIssueComment.name,
                error,
                metadata: { params },
            });

            return null;
        }
    }

    async updateIssueComment(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { name: string; id: string };
        prNumber: number;
        commentId: number;
        body: any;
    }): Promise<any | null> {
        try {
            const {
                organizationAndTeamData,
                repository,
                prNumber,
                commentId,
                body,
            } = params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                repository.id,
            );

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            // added ts-ignore because _body expects a type property but Bitbucket rejects it
            const comment = await bitbucketAPI.pullrequests
                .updateComment({
                    comment_id: commentId,
                    pull_request_id: prNumber,
                    repo_slug: `{${repository.id}}`,
                    workspace: `{${workspace}}`,
                    // @ts-ignore
                    _body: {
                        content: {
                            raw: body,
                        },
                    },
                })
                .then((res) => res.data);

            this.logger.log({
                message: `Updated issue comment for PR#${prNumber}`,
                context: BitbucketService.name,
                serviceName: 'BitbucketService updateIssueComment',
                metadata: {
                    params,
                },
            });

            return comment;
        } catch (error) {
            this.logger.error({
                message: 'Error to update issue comment',
                context: BitbucketService.name,
                serviceName: 'BitbucketService updateIssueComment',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async markReviewCommentAsResolved(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { name: string; id: string };
        prNumber: number;
        commentId: number;
    }): Promise<any | null> {
        try {
            const { organizationAndTeamData, repository, prNumber, commentId } =
                params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                repository.id,
            );

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            const resolvedComment =
                await bitbucketAPI.pullrequests.resolveComment({
                    comment_id: commentId,
                    pull_request_id: prNumber,
                    repo_slug: `{${repository.id}}`,
                    workspace: `{${workspace}}`,
                });
            return resolvedComment.data;
        } catch (error) {
            this.logger.error({
                message: 'Error marking review comment as resolved',
                context: BitbucketService.name,
                serviceName: 'BitbucketService markReviewCommentAsResolved',
                error: error,
                metadata: {
                    params,
                },
            });
            throw new BadRequestException(
                'Failed to mark discussion as resolved for merge request',
            );
        }
    }

    async findTeamAndOrganizationIdByConfigKey(
        params: any,
    ): Promise<IntegrationConfigEntity | null> {
        try {
            const integrationConfig =
                await this.integrationConfigService.findOne({
                    configKey: IntegrationConfigKey.REPOSITORIES,
                    configValue: [{ id: params?.repository?.id?.toString() }],
                });

            return integrationConfig &&
                integrationConfig?.configValue?.length > 0
                ? integrationConfig
                : null;
        } catch (err) {
            this.logger.error({
                message: 'Error to find team and organization id by config key',
                context: BitbucketService.name,
                serviceName:
                    'BitbucketService findTeamAndOrganizationIdByConfigKey',
                error: err,
                metadata: {
                    params,
                },
            });
            throw new BadRequestException(err);
        }
    }

    async getDefaultBranch(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { name: string; id: string };
    }): Promise<string> {
        try {
            const { organizationAndTeamData, repository } = params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                repository.id,
            );

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            const repo = await bitbucketAPI.repositories
                .get({
                    repo_slug: `{${repository.id}}`,
                    workspace: `{${workspace}}`,
                })
                .then((res) => res.data);

            return repo?.mainbranch?.name;
        } catch (error) {
            this.logger.error({
                message: 'Error to get default branch',
                context: BitbucketService.name,
                serviceName: 'BitbucketService getDefaultBranch',
                error: error,
                metadata: {
                    params,
                },
            });
            return '';
        }
    }

    async getPullRequestReviewComment(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        filters: any;
    }): Promise<any | null> {
        try {
            const { organizationAndTeamData, filters } = params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                filters.repository.id,
            );

            if (!workspace) {
                return null;
            }

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            if (!bitbucketAPI) {
                return null;
            }
            const comments = await bitbucketAPI.pullrequests
                .listComments({
                    pull_request_id: filters.pullRequestNumber,
                    repo_slug: `{${filters.repository.id}}`,
                    workspace: `{${workspace}}`,
                })
                .then((res) => this.getPaginatedResults(bitbucketAPI, res));

            // Adds a replies field to each comment.
            const commentMap = comments.reduce((acc, comment) => {
                // Initialize the replies field and map the comment by ID
                comment.replies = [];
                acc[comment.id] = comment;

                // If the comment has a parent, add it to the parent's replies array
                if (comment.parent) {
                    const parentId = comment.parent.id;
                    if (acc[parentId]) {
                        acc[parentId].replies.push(comment);
                    }
                }

                return acc;
            }, {});

            const organizedComments: any = Object.values(commentMap);

            return organizedComments
                .map((comment) => ({
                    id: comment?.id,
                    body: comment?.content?.raw,
                    createdAt: comment?.created_on,
                    originalCommit: comment?.pullrequest?.source?.commit?.hash,
                    parent: comment?.parent, // present if the comment is a replies to another comment.
                    replies: comment?.replies,
                    author: {
                        id: this.sanitizeUUId(comment?.user?.uuid),
                        username: comment?.user?.display_name,
                        name: comment?.user?.display_name,
                    },
                }))
                .sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime(),
                );
        } catch (error) {
            this.logger.error({
                message: 'Error to get pull request review comment',
                context: BitbucketService.name,
                serviceName: 'BitbucketService getPullRequestReviewComment',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async createResponseToComment(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { id: string; name: string };
        prNumber: number;
        body: any;
        inReplyToId: number;
    }): Promise<any | null> {
        try {
            const {
                organizationAndTeamData,
                repository,
                prNumber,
                body,
                inReplyToId,
            } = params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                repository.id,
            );

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            // added ts-ignore because parent expects a type property but Bitbucket rejects it
            bitbucketAPI.pullrequests.createComment({
                pull_request_id: prNumber,
                repo_slug: `{${repository.id}}`,
                workspace: `{${workspace}}`,
                _body: {
                    content: {
                        raw: body,
                    },
                    // @ts-ignore
                    parent: {
                        id: inReplyToId,
                    },
                },
            });
        } catch (error) {
            this.logger.error({
                message: 'Error to create response to comment',
                context: BitbucketService.name,
                serviceName: 'BitbucketService createResponseToComment',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async updateDescriptionInPullRequest(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: any;
        prNumber: number;
        summary: any;
    }): Promise<any | null> {
        try {
            const { organizationAndTeamData, repository, prNumber, summary } =
                params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                repository.id,
            );

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            // added ts-ignore because _body expects a type property but Bitbucket rejects it
            await bitbucketAPI.pullrequests.update({
                pull_request_id: prNumber,
                repo_slug: `{${repository.id}}`,
                workspace: `{${workspace}}`,
                // @ts-ignore
                _body: {
                    summary: {
                        raw: summary,
                    },
                },
            });
        } catch (error) {
            this.logger.error({
                message: `Error to update description in pull request #${params.prNumber}`,
                context: BitbucketService.name,
                serviceName: 'BitbucketService updateDescriptionInPullRequest',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async getLanguageRepository(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { name: string; id: string };
    }): Promise<any | null> {
        try {
            const { organizationAndTeamData, repository } = params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                repository.id,
            );

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            const repo = await bitbucketAPI.repositories
                .get({
                    repo_slug: `{${repository.id}}`,
                    workspace: `{${workspace}}`,
                })
                .then((res) => res.data);

            return repo.language ?? null;
        } catch (error) {
            this.logger.error({
                message: `Error to get language repository`,
                context: BitbucketService.name,
                serviceName: 'BitbucketService getLanguageRepository',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async createAuthIntegration(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        authMode: AuthMode;
        code?: string;
        token?: string;
        username?: string;
    }): Promise<{ success: boolean; status?: CreateAuthIntegrationStatus }> {
        try {
            let res: {
                success: boolean;
                status?: CreateAuthIntegrationStatus;
            } = { success: true, status: CreateAuthIntegrationStatus.SUCCESS };
            if (params && params?.authMode === AuthMode.OAUTH) {
                throw new Error(
                    'Authenticating on Bitbucket via OAuth not implemented',
                );
            } else if (
                params &&
                params?.authMode === AuthMode.TOKEN &&
                params.token
            ) {
                res = await this.authenticateWithToken({
                    organizationAndTeamData: params.organizationAndTeamData,
                    token: params.token,
                    username: params.username,
                });
            }

            return res;
        } catch (err) {
            this.logger.error({
                message: 'Error to create auth integration',
                context: BitbucketService.name,
                serviceName: 'BitbucketService createAuthIntegration',
                error: err,
                metadata: {
                    params,
                },
            });
            throw new BadRequestException(err);
        }
    }

    async updateAuthIntegration(params: any): Promise<any> {
        try {
            await this.integrationService.update(
                {
                    uuid: params.integrationId,
                    authIntegration: params.authIntegrationId,
                    organization: {
                        uuid: params.organizationAndTeamData.organizationId,
                    },
                    team: { uuid: params.organizationAndTeamData.teamId },
                },
                {
                    status: true,
                },
            );

            return await this.authIntegrationService.update(
                {
                    uuid: params.authIntegrationId,
                    organization: {
                        uuid: params.organizationAndTeamData.organizationId,
                    },
                    team: { uuid: params.organizationAndTeamData.teamId },
                },
                {
                    status: true,
                    authDetails: params?.authDetails,
                    organization: {
                        uuid: params.organizationAndTeamData.organizationId,
                    },
                    team: { uuid: params.organizationAndTeamData.teamId },
                },
            );
        } catch (err) {
            this.logger.error({
                message: 'Error to update auth integration',
                context: BitbucketService.name,
                serviceName: 'BitbucketService updateAuthIntegration',
                error: err,
                metadata: {
                    params,
                },
            });
            throw new BadRequestException(err);
        }
    }

    async createOrUpdateIntegrationConfig(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        configKey: IntegrationConfigKey;
        configValue: any;
    }): Promise<void> {
        try {
            const integration = await this.integrationService.findOne({
                organization: {
                    uuid: params.organizationAndTeamData.organizationId,
                },
                team: { uuid: params.organizationAndTeamData.teamId },
                platform: PlatformType.BITBUCKET,
            });

            if (!integration) {
                return;
            }

            await this.integrationConfigService.createOrUpdateConfig(
                params.configKey,
                params.configValue,
                integration?.uuid,
                params.organizationAndTeamData,
            );

            this.createWebhook(params.organizationAndTeamData);
        } catch (error) {
            this.logger.error({
                message: 'Error to create or update integration config',
                context: BitbucketService.name,
                serviceName: 'BitbucketService createOrUpdateIntegrationConfig',
                error: error,
                metadata: {
                    params,
                },
            });
            throw new BadRequestException(error.message);
        }
    }

    async createWebhook(
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<void> {
        try {
            const bitbucketAuthDetail = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const bitbucketAPI = this.instanceBitbucketApi(bitbucketAuthDetail);

            const repositories = <Repositories[]>(
                await this.findOneByOrganizationAndTeamDataAndConfigKey(
                    organizationAndTeamData,
                    IntegrationConfigKey.REPOSITORIES,
                )
            );

            const webhookUrl =
                process.env.GLOBAL_BITBUCKET_CODE_MANAGEMENT_WEBHOOK;

            for (const repo of repositories) {
                const existingHooks = await bitbucketAPI.webhooks
                    .listForRepo({
                        repo_slug: `{${repo.id}}`,
                        workspace: `{${repo.workspaceId}}`,
                    })
                    .then((res) => this.getPaginatedResults(bitbucketAPI, res));

                const hookExists = existingHooks.some(
                    (hook) => hook.url === webhookUrl,
                );

                if (!hookExists) {
                    await bitbucketAPI.webhooks.create({
                        repo_slug: `{${repo.id}}`,
                        workspace: `{${repo.workspaceId}}`,
                        _body: {
                            description: 'Kodus Webhook',
                            url: webhookUrl,
                            active: true,
                            events: [
                                'pullrequest:created',
                                'pullrequest:updated',
                                'pullrequest:rejected',
                                'pullrequest:fulfilled',
                                'pullrequest:comment_created',
                            ],
                        },
                    });
                    this.logger.log({
                        message: 'Webhook created successfully',
                        context: BitbucketService.name,
                        serviceName:
                            'BitbucketService createMergeRequestWebhook',
                        metadata: {
                            organizationAndTeamData,
                        },
                    });
                } else {
                    this.logger.log({
                        message: 'Webhook already exists',
                        context: BitbucketService.name,
                        serviceName:
                            'BitbucketService createMergeRequestWebhook',
                        metadata: {
                            organizationAndTeamData,
                        },
                    });
                }
            }
        } catch (error) {
            this.logger.error({
                message: 'Error to create webhook',
                context: BitbucketService.name,
                serviceName: 'BitbucketService createMergeRequestWebhook',
                error: error,
                metadata: {
                    organizationAndTeamData,
                },
            });
            throw error;
        }
    }

    async getAuthDetails(
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<BitbucketAuthDetail> {
        try {
            const bitbucketAuthDetail =
                await this.integrationService.getPlatformAuthDetails<BitbucketAuthDetail>(
                    organizationAndTeamData,
                    PlatformType.BITBUCKET,
                );

            return {
                ...bitbucketAuthDetail,
                authMode: bitbucketAuthDetail?.authMode || AuthMode.TOKEN,
            };
        } catch (err) {
            this.logger.error({
                message: 'Error to get auth details',
                context: BitbucketService.name,
                serviceName: 'BitbucketService getAuthDetails',
                error: err,
                metadata: {
                    organizationAndTeamData,
                },
            });
        }
    }

    private instanceBitbucketApi(bitbucketAuthDetail: BitbucketAuthDetail) {
        try {
            const bitbucketAPI = new Bitbucket({
                auth: {
                    username: bitbucketAuthDetail.username,
                    password: decrypt(bitbucketAuthDetail.appPassword),
                },
            });

            return bitbucketAPI;
        } catch (err) {
            this.logger.error({
                message: 'Error to instance Bitbucket API',
                context: BitbucketService.name,
                serviceName: 'BitbucketService instanceBitbucketApi',
                error: err,
                metadata: {
                    bitbucketAuthDetail,
                },
            });
        }
    }

    async findOneByOrganizationAndTeamDataAndConfigKey(
        organizationAndTeamData: OrganizationAndTeamData,
        configKey:
            | IntegrationConfigKey.INSTALLATION_GITHUB
            | IntegrationConfigKey.REPOSITORIES,
    ): Promise<any> {
        try {
            const integration = await this.integrationService.findOne({
                organization: { uuid: organizationAndTeamData.organizationId },
                team: { uuid: organizationAndTeamData.teamId },
                platform: PlatformType.BITBUCKET,
            });

            if (!integration) return;

            const integrationConfig =
                await this.integrationConfigService.findOne({
                    integration: { uuid: integration?.uuid },
                    team: { uuid: organizationAndTeamData.teamId },
                    configKey,
                });

            return integrationConfig?.configValue || null;
        } catch (err) {
            this.logger.error({
                message: 'Error to find one by organization and team data',
                context: BitbucketService.name,
                serviceName:
                    'BitbucketService findOneByOrganizationAndTeamDataAndConfigKey',
                error: err,
                metadata: {
                    organizationAndTeamData,
                    configKey,
                },
            });
            throw new BadRequestException(err);
        }
    }

    async authenticateWithToken(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        username: string;
        token: string;
    }): Promise<{ success: boolean; status?: CreateAuthIntegrationStatus }> {
        try {
            const { organizationAndTeamData, token, username } = params;

            const bitbucketAPI = new Bitbucket({
                auth: {
                    username,
                    password: token,
                },
            });

            const testResponse = await bitbucketAPI.user.get({});

            if (
                !testResponse ||
                testResponse.status === 401 ||
                !testResponse.data
            ) {
                throw new Error('Bitbucket failed to validate the PAT.');
            }

            const checkRepos = await this.checkRepositoryPermissions({
                bitbucketAPI,
            });
            if (!checkRepos.success) return checkRepos;

            const integration = await this.integrationService.findOne({
                organization: {
                    uuid: organizationAndTeamData.organizationId,
                },
                team: { uuid: organizationAndTeamData.teamId },
                platform: PlatformType.BITBUCKET,
            });

            const authDetails: BitbucketAuthDetail = {
                username: username,
                appPassword: encrypt(token),
                authMode: AuthMode.TOKEN,
            };

            await this.handleIntegration(
                integration,
                authDetails,
                organizationAndTeamData,
            );

            return {
                success: true,
                status: CreateAuthIntegrationStatus.SUCCESS,
            };
        } catch (err) {
            this.logger.error({
                message: 'Error to authenticate with token',
                context: BitbucketService.name,
                serviceName: 'BitbucketService authenticateWithToken',
                error: err,
                metadata: {
                    params,
                },
            });
            throw new BadRequestException(
                'Error authenticating with Bitbucket PAT.',
            );
        }
    }

    private async checkRepositoryPermissions(params: {
        bitbucketAPI: APIClient;
    }) {
        try {
            const { bitbucketAPI } = params;

            const workspaces = await bitbucketAPI.workspaces
                .getWorkspaces({})
                .then((res) => res.data.values);

            const workspace = workspaces[0];

            const repositories = await bitbucketAPI.repositories
                .list({
                    workspace: workspace.uuid,
                })
                .then((res) => res.data.values);

            if (repositories.length === 0) {
                return {
                    success: false,
                    status: CreateAuthIntegrationStatus.NO_REPOSITORIES,
                };
            }

            return {
                success: true,
                status: CreateAuthIntegrationStatus.SUCCESS,
            };
        } catch (error) {
            this.logger.error({
                message:
                    'Failed to list repositories when creating integration',
                context: BitbucketService.name,
                error: error,
                metadata: params,
            });
            return {
                success: false,
                status: CreateAuthIntegrationStatus.NO_REPOSITORIES,
            };
        }
    }

    async handleIntegration(
        integration: IntegrationEntity | null,
        authDetails: BitbucketAuthDetail,
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<void> {
        if (!integration) {
            await this.addAccessToken(organizationAndTeamData, authDetails);
        } else {
            await this.updateAuthIntegration({
                organizationAndTeamData,
                authIntegrationId: integration?.authIntegration?.uuid,
                integrationId: integration?.uuid,
                authDetails,
            });
        }
    }

    async addAccessToken(
        organizationAndTeamData: OrganizationAndTeamData,
        authDetails: BitbucketAuthDetail,
    ): Promise<IntegrationEntity> {
        const authUuid = v4();

        const authIntegration = await this.authIntegrationService.create({
            uuid: authUuid,
            status: true,
            authDetails,
            organization: { uuid: organizationAndTeamData.organizationId },
            team: { uuid: organizationAndTeamData.teamId },
        });

        return await this.addIntegration(
            organizationAndTeamData,
            authIntegration?.uuid,
        );
    }

    async addIntegration(
        organizationAndTeamData: OrganizationAndTeamData,
        authIntegrationId: string,
    ): Promise<IntegrationEntity> {
        const integrationUuid = v4();

        return await this.integrationService.create({
            uuid: integrationUuid,
            platform: PlatformType.BITBUCKET,
            integrationCategory: IntegrationCategory.CODE_MANAGEMENT,
            status: true,
            organization: { uuid: organizationAndTeamData.organizationId },
            team: { uuid: organizationAndTeamData.teamId },
            authIntegration: { uuid: authIntegrationId },
        });
    }

    private async getWorkspaceFromRepository(
        organizationAndTeamData: OrganizationAndTeamData,
        repositoryId: string,
    ): Promise<string | null> {
        const repositories = <Repositories[]>(
            await this.findOneByOrganizationAndTeamDataAndConfigKey(
                organizationAndTeamData,
                IntegrationConfigKey.REPOSITORIES,
            )
        );

        if (!repositories) {
            return null;
        }

        const repo = repositories.find((repo) => repo.id === repositoryId);

        return repo?.workspaceId || null;
    }

    private async getRepoById(
        organizationAndTeamData: OrganizationAndTeamData,
        repositoryId: string,
    ): Promise<Repositories | null> {
        const repositories = <Repositories[]>(
            await this.findOneByOrganizationAndTeamDataAndConfigKey(
                organizationAndTeamData,
                IntegrationConfigKey.REPOSITORIES,
            )
        );

        if (!repositories) {
            return null;
        }

        return repositories.find((repo) => repo.id === repositoryId);
    }

    async mergePullRequest(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        prNumber: number;
        repository: { id: string; name: string };
    }) {
        try {
            const { organizationAndTeamData, prNumber, repository } = params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                repository.id,
            );

            if (!workspace) {
                return null;
            }

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            await bitbucketAPI.pullrequests.merge({
                pull_request_id: prNumber,
                repo_slug: `{${repository.id}}`,
                workspace: `{${workspace}}`,
            });

            this.logger.log({
                message: `Merged pull request #${prNumber}`,
                context: BitbucketService.name,
                serviceName: 'BitbucketService mergePullRequest',
                metadata: {
                    params,
                },
            });
        } catch (error) {
            this.logger.error({
                message: `Error to merge pull request #${params.prNumber}`,
                context: BitbucketService.name,
                serviceName: 'BitbucketService mergePullRequest',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async checkIfPullRequestShouldBeApproved(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        prNumber: number;
        repository: { id: string; name: string };
    }) {
        try {
            const { organizationAndTeamData, prNumber, repository } = params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                repository.id,
            );

            if (!workspace) {
                return null;
            }

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            if (!bitbucketAuthDetails) {
                this.logger.warn({
                    message: 'Bitbucket auth details not found',
                    context: this.checkIfPullRequestShouldBeApproved.name,
                    metadata: { organizationAndTeamData },
                });
                return null;
            }

            const currentUser = (await bitbucketAPI.users.getAuthedUser({}))
                .data;

            const activities = await bitbucketAPI.pullrequests
                .listActivities({
                    repo_slug: `{${repository.id}}`,
                    workspace: `{${workspace}}`,
                    pull_request_id: prNumber,
                })
                .then((res) => this.getPaginatedResults(bitbucketAPI, res));

            const isApprovedByCurrentUser = activities.find(
                (activity: any) =>
                    activity.approval?.user?.uuid === currentUser?.uuid,
            );

            if (isApprovedByCurrentUser) {
                return null;
            }

            await this.approvePullRequest({
                organizationAndTeamData,
                prNumber,
                repository,
            });
        } catch (error) {
            this.logger.error({
                message: `Error to approve pull request #${params.prNumber}`,
                context: BitbucketService.name,
                serviceName:
                    'BitbucketService checkIfPullRequestShouldBeApproved',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async approvePullRequest(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        prNumber: number;
        repository: { id: string; name: string };
    }) {
        try {
            const { organizationAndTeamData, prNumber, repository } = params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                repository.id,
            );

            if (!workspace) {
                return null;
            }

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            await bitbucketAPI.pullrequests.createApproval({
                pull_request_id: prNumber,
                repo_slug: `{${repository.id}}`,
                workspace: `{${workspace}}`,
            });

            this.logger.log({
                message: `Approved pull request #${prNumber}`,
                context: BitbucketService.name,
                serviceName: 'BitbucketService approvePullRequest',
                metadata: {
                    params,
                },
            });
        } catch (error) {
            this.logger.error({
                message: `Error to approve pull request #${params.prNumber}`,
                context: BitbucketService.name,
                serviceName: 'BitbucketService approvePullRequest',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async requestChangesPullRequest(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        prNumber: number;
        repository: { id: string; name: string };
        criticalComments: CommentResult[];
    }) {
        try {
            const {
                organizationAndTeamData,
                prNumber,
                repository,
                criticalComments,
            } = params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                repository.id,
            );

            if (!workspace) {
                return null;
            }

            const listOfCriticalIssues =
                this.getListOfCriticalIssues(criticalComments);

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            await bitbucketAPI.pullrequests.addChangeRequest({
                pull_request_id: prNumber,
                repo_slug: `{${repository.id}}`,
                workspace: `{${workspace}}`,
            });

            const title =
                '# Found critical issues please review the requested changes';

            const bodyFormatted = `${title}\n\n${listOfCriticalIssues}`;

            await this.createCommentInPullRequest({
                body: bodyFormatted,
                organizationAndTeamData,
                prNumber,
                repository,
            });

            this.logger.log({
                message: `Changed status to requested changes on pull request #${prNumber}`,
                context: BitbucketService.name,
                serviceName: 'BitbucketService requestChangesPullRequest',
                metadata: {
                    params,
                },
            });
        } catch (error) {
            this.logger.error({
                message: `Error to change status to requested changes on pull request #${params.prNumber}`,
                context: BitbucketService.name,
                serviceName: 'BitbucketService requestChangesPullRequest',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    getListOfCriticalIssues(criticalComments: CommentResult[]): string {
        const criticalIssuesSummaryArray =
            this.getCriticalIssuesSummaryArray(criticalComments);

        const listOfCriticalIssues = criticalIssuesSummaryArray
            .map((criticalIssue) => {
                const summary = criticalIssue.oneSentenceSummary;
                const formattedItem = `- ${summary}`;

                return formattedItem.trim();
            })
            .join('\n');

        return listOfCriticalIssues;
    }

    getCriticalIssuesSummaryArray(
        criticalComments: CommentResult[],
    ): OneSentenceSummaryItem[] {
        const criticalIssuesSummaryArray: OneSentenceSummaryItem[] =
            criticalComments.map((comment) => {
                return {
                    id: comment.codeReviewFeedbackData.commentId,
                    oneSentenceSummary:
                        comment.comment.suggestion.oneSentenceSummary ?? '',
                };
            });

        return criticalIssuesSummaryArray;
    }

    async getAllCommentsInPullRequest(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { name: string; id: string };
        prNumber: number;
    }) {
        try {
            const { organizationAndTeamData, repository, prNumber } = params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                repository.id,
            );

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            const comments = await bitbucketAPI.pullrequests
                .listComments({
                    pull_request_id: prNumber,
                    repo_slug: `{${repository.id}}`,
                    workspace: `{${workspace}}`,
                })
                .then((res) => this.getPaginatedResults(bitbucketAPI, res));

            return comments.map((comment) => ({
                id: comment?.id,
                body: comment?.content?.raw,
                createdAt: comment?.created_on,
                originalCommit: comment?.pullrequest?.source?.commit?.hash,
                author: {
                    id: this.sanitizeUUId(comment?.user?.uuid),
                    username: comment?.user?.display_name,
                    name: comment?.user?.display_name,
                },
            }));
        } catch (error) {
            this.logger.error({
                message: 'Error to get all comments in pull request',
                context: BitbucketService.name,
                serviceName: 'BitbucketService getAllCommentsInPullRequest',
                error: error.message,
                metadata: params,
            });
            return [];
        }
    }

    async getPullRequestsByRepository(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: {
            id: string;
            name: string;
        };
        filters?: {
            startDate: string;
            endDate: string;
        };
    }) {
        try {
            const { organizationAndTeamData, repository, filters } = params;

            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                repository.id,
            );

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            let queryString = '';
            if (filters?.startDate) {
                queryString += `created_on >= "${filters.startDate}"`;
            }
            if (filters?.endDate) {
                queryString += `${
                    queryString ? ' AND ' : ''
                }created_on <= "${filters.endDate}"`;
            }

            const pullRequests = await bitbucketAPI.pullrequests
                .list({
                    repo_slug: `{${repository.id}}`,
                    workspace: `{${workspace}}`,
                    q: queryString,
                    fields: '+values.participants,+values.reviewers',
                })
                .then((res) => this.getPaginatedResults(bitbucketAPI, res));

            return pullRequests.map((pr) =>
                this.transformPullRequest(
                    pr,
                    repository.name,
                    organizationAndTeamData.organizationId,
                ),
            );
        } catch (error) {
            this.logger.error({
                message: 'Error to get pull requests by repository',
                context: BitbucketService.name,
                serviceName: 'BitbucketService getPullRequestsByRepository',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async getUserByUsername(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        username: string;
    }): Promise<any | null> {
        const { organizationAndTeamData, username } = params;

        if (!username) {
            return null;
        }

        try {
            const bitbucketAuthDetails = await this.getAuthDetails(
                organizationAndTeamData,
            );

            const bitbucketAPI =
                this.instanceBitbucketApi(bitbucketAuthDetails);

            const user = await bitbucketAPI.users
                .get({
                    selected_user: username,
                    fields: '+values.username,+values.email',
                })
                .then((res) => res.data);

            return user ?? null;
        } catch (error: any) {
            if (error?.response?.status === 404) {
                this.logger.warn({
                    message: `Bitbucket user not found: ${username}`,
                    context: BitbucketService.name,
                    metadata: { username, organizationAndTeamData },
                });
                return null;
            }

            this.logger.error({
                message: `Error retrieving user by username`,
                context: BitbucketService.name,
                serviceName: 'BitbucketService getUserByUsername',
                error,
                metadata: {
                    username,
                    organizationAndTeamData,
                },
            });
            return null;
        }
    }

    async getPullRequestReviewComments(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: Partial<Repository>;
        prNumber: number;
    }): Promise<PullRequestReviewComment[] | null> {
        try {
            const { organizationAndTeamData, repository, prNumber } = params;

            const bitbucketAuthDetail = await this.getAuthDetails(
                organizationAndTeamData,
            );

            if (!bitbucketAuthDetail) {
                return null;
            }

            const workspace = await this.getWorkspaceFromRepository(
                organizationAndTeamData,
                repository.id,
            );

            if (!workspace) {
                return null;
            }

            const bitbucketAPI = this.instanceBitbucketApi(bitbucketAuthDetail);

            const comments = await bitbucketAPI.pullrequests
                .listComments({
                    repo_slug: `{${repository.id}}`,
                    workspace: `{${workspace}}`,
                    pull_request_id: prNumber,
                    fields: '+values.resolution.type,+values.resolution.+values.id,+values.pullrequest',
                })
                .then((res) => this.getPaginatedResults(bitbucketAPI, res));

            return comments
                .filter((comment) => {
                    return (
                        !comment?.content?.raw.includes(
                            KODY_CODE_REVIEW_COMPLETED_MARKER,
                        ) &&
                        !comment?.content?.raw.includes(
                            KODY_CRITICAL_ISSUE_COMMENT_MARKER,
                        ) &&
                        !comment?.content?.raw.includes(
                            KODY_START_COMMAND_MARKER,
                        )
                    ); // Exclude comments with the specific strings
                })
                .map((comment) => {
                    const mappedComment: PullRequestReviewComment = {
                        id: comment?.id,
                        threadId: null, // Bitbucket comments are resolved by id,so no threadId necessary
                        body: comment?.content?.raw ?? '',
                        createdAt: comment?.created_on,
                        updatedAt: comment?.updated_on,
                        isResolved: comment.resolution ? true : false,
                        author: {
                            id: this.sanitizeUUId(comment?.user?.uuid) ?? '',
                            username: comment?.user?.display_name ?? '',
                            name: comment?.user?.display_name ?? '',
                        },
                    };
                    return mappedComment;
                })
                .sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime(),
                );
        } catch (error) {
            this.logger.error({
                message: 'Error to get pull requests with files',
                context: BitbucketService.name,
                serviceName: 'BitbucketService getPullRequestReviewComments',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    async countReactions(params: { comments: any[]; pr: any }): Promise<any[]> {
        try {
            const { comments, pr } = params;

            const thumbsUpText = '👍';
            const thumbsDownText = '👎';

            const commentsWithNumberOfReactions = comments
                .filter(
                    (comment: any) =>
                        comment.replies && comment.replies.length > 0,
                )
                .map((comment: any) => {
                    comment.totalReactions = 0;
                    comment.thumbsUp = 0;
                    comment.thumbsDown = 0;

                    const userReactions = new Map();

                    comment.replies.forEach((reply) => {
                        const userId = reply.user.uuid;
                        const replyBody = reply.content.raw;

                        // Initialize user reaction if not already present
                        if (!userReactions.has(userId)) {
                            userReactions.set(userId, {
                                thumbsUp: false,
                                thumbsDown: false,
                            });
                        }

                        const userReaction = userReactions.get(userId);

                        // Check for thumbs up reaction
                        if (
                            replyBody.includes(thumbsUpText) &&
                            !userReaction.thumbsUp
                        ) {
                            comment.thumbsUp++;
                            userReaction.thumbsUp = true;
                        }

                        // Check for thumbs down reaction
                        if (
                            replyBody.includes(thumbsDownText) &&
                            !userReaction.thumbsDown
                        ) {
                            comment.thumbsDown++;
                            userReaction.thumbsDown = true;
                        }
                    });

                    comment.totalReactions =
                        comment.thumbsUp + comment.thumbsDown;

                    return comment;
                });

            const reactionsInComments: ReactionsInComments[] =
                commentsWithNumberOfReactions
                    .filter((comment) => comment.totalReactions > 0)
                    .map((comment: any) => ({
                        reactions: {
                            thumbsUp: comment.thumbsUp,
                            thumbsDown: comment.thumbsDown,
                        },
                        comment: {
                            id: comment.id,
                            body: comment.body,
                            pull_request_review_id: pr.pull_number,
                        },
                        pullRequest: {
                            id: pr.id,
                            number: pr.pull_number,
                            repository: {
                                id: pr.repository.id,
                                fullName: pr.repository.name,
                            },
                        },
                    }));

            return reactionsInComments;
        } catch (error) {
            this.logger.error({
                message: `Error when trying to count reactions in PR${params.pr.pull_number}`,
                context: BitbucketService.name,
                serviceName: 'BitbucketService countReactions',
                error: error,
                metadata: {
                    params,
                },
            });
            return null;
        }
    }

    /**
    this function is used to get all the results from a paginated response
    it will keep making requests to the next page until there are no more pages

    the type `T` is the type of the values that are paginated, most of the time
    this can be inferred from the response type and there's no need to specify it
    manually, but in some cases it might be necessary to specify it manually
    (e.g `getPaginatedResults<Schema.Diffstat>(bitbucketAPI, res)`)
    */
    private async getPaginatedResults<T>(
        bitbucketAPI: APIClient,
        response: BitbucketResponse<{ values?: T[] }>,
    ): Promise<T[]> {
        let allResults = [...response.data.values];
        let currentResults = response.data;

        while (bitbucketAPI.hasNextPage(currentResults)) {
            currentResults = (await bitbucketAPI.getNextPage(currentResults))
                .data;

            allResults = allResults.concat(currentResults.values);
        }

        return allResults;
    }

    /** Bitbucket's API returns IDs with curly braces around them (e.g. "{123}").
    This function removes the curly braces. */
    private sanitizeUUId(id: string) {
        return id?.replace(/[{}]/g, '');
    }

    /** Extracts the username and email from a string with the following format: "Name <Email>" */
    private extractUsernameEmail(author: Schema.Author) {
        const raw = author?.raw || '';

        // (.+) = capture group #1, anything before the '<'
        // ([^<]+) = capture group #2, anything inside the '<' and '>'
        // #1<#2> = capture group #0, the entire string
        const regex = /(.+)<([^>]+)/;

        const match = raw.match(regex);

        const username = match[1] || author?.user?.display_name || raw;
        const email = match ? match[2] : raw;

        return [username.trim(), email.trim()];
    }

    private convertDiff(diff: string) {
        return diff.split('\n').slice(4).join('\n');
    }

    private transformPullRequest(
        pr: Schema.Pullrequest,
        repository: string,
        organizationId: string,
    ): PullRequests & any {
        const stateMap = {
            OPEN: PullRequestState.OPENED,
            MERGED: PullRequestState.CLOSED,
        };

        return {
            id: pr.id?.toString(),
            author_id: this.sanitizeUUId(pr.author?.uuid?.toString()),
            author_name: pr.author?.display_name,
            author_created_at: pr.created_on,
            repository: repository,
            repositoryId: this.sanitizeUUId(pr?.source?.repository?.uuid),
            message: pr.summary?.raw,
            state: stateMap[pr.state] || PullRequestState.ALL,
            prURL: pr.links?.html?.href,
            organizationId: organizationId,
            pull_number: pr.id,
            number: pr.id,
            body: pr.summary?.raw,
            title: pr.title,
            created_at: pr.created_on,
            updated_at: pr.updated_on,
            merged_at: pr.updated_on,
            participants: pr.participants,
            reviewers: pr.reviewers.map((reviewer) => ({
                ...reviewer,
                uuid: this.sanitizeUUId(reviewer.uuid),
            })),
            head: {
                ref: pr.source?.branch?.name,
                repo: {
                    id: this.sanitizeUUId(pr.source?.repository?.uuid),
                    name: pr.source?.repository?.name,
                },
            },
            base: {
                ref: pr.destination?.branch?.name,
            },
            user: {
                login: pr.author?.display_name ?? '',
                name: pr.author?.display_name,
                id: this.sanitizeUUId(pr.author?.uuid),
            },
        };
    }

    async deleteWebhook(params: {
        organizationAndTeamData: OrganizationAndTeamData;
    }): Promise<void> {
        const authDetails = await this.getAuthDetails(
            params.organizationAndTeamData,
        );
        const bitbucketAPI = this.instanceBitbucketApi(authDetails);

        if (authDetails.authMode === AuthMode.TOKEN) {
            const repositories = <Repositories[]>(
                await this.findOneByOrganizationAndTeamDataAndConfigKey(
                    params.organizationAndTeamData,
                    IntegrationConfigKey.REPOSITORIES,
                )
            );

            const webhookUrl = this.configService.get<string>(
                'GLOBAL_BITBUCKET_CODE_MANAGEMENT_WEBHOOK',
            );

            if (!webhookUrl) {
                this.logger.error({
                    message: 'Bitbucket webhook URL not found',
                    context: BitbucketService.name,
                });
                return;
            }

            for (const repo of repositories) {
                try {
                    const existingHooks = await bitbucketAPI.webhooks
                        .listForRepo({
                            repo_slug: `{${repo.id}}`,
                            workspace: `{${repo.workspaceId}}`,
                        })
                        .then((res) =>
                            this.getPaginatedResults(bitbucketAPI, res),
                        );

                    const webhook = existingHooks.find(
                        (hook) => hook.url === webhookUrl,
                    );

                    if (webhook) {
                        await bitbucketAPI.repositories.deleteWebhook({
                            repo_slug: `{${repo.id}}`,
                            workspace: `{${repo.workspaceId}}`,
                            uid: webhook.uuid,
                        });

                        this.logger.log({
                            message: `Webhook deleted successfully for repository ${repo.name}`,
                            context: this.deleteWebhook.name,
                            metadata: {
                                repository: repo.name,
                                workspace: repo.workspaceId,
                                organizationAndTeamData:
                                    params.organizationAndTeamData,
                            },
                        });
                    }
                } catch (error) {
                    this.logger.error({
                        message: `Error deleting Bitbucket webhook for repository ${repo.name}`,
                        context: this.deleteWebhook.name,
                        error: error,
                        metadata: {
                            repository: repo.name,
                            workspace: repo.workspaceId,
                            organizationAndTeamData:
                                params.organizationAndTeamData,
                        },
                    });
                }
            }
        }
    }
}
