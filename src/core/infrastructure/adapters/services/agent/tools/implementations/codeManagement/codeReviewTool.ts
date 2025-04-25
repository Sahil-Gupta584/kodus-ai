import { Inject, Injectable } from '@nestjs/common';
import { ITool, ToolExecutionContext } from '../../interfaces/ITool.interface';
import { IToolResult } from '@/core/domain/agents/interfaces/toolResult.interface';
import { CodeManagementService } from '../../../../platformIntegration/codeManagement.service';
import { PinoLoggerService } from '../../../../logger/pino.service';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import {
    CODE_BASE_CONFIG_SERVICE_TOKEN,
    ICodeBaseConfigService,
} from '../../../../../../../domain/codeBase/contracts/CodeBaseConfigService.contract';
import {
    IParametersService,
    PARAMETERS_SERVICE_TOKEN,
} from '@/core/domain/parameters/contracts/parameters.service.contract';

const codeReviewToolDefinition = {
    tool_name: 'CodeReviewTool',
    tool_description:
        'Performs a code review and provides feedback on code quality, style, and potential issues.',
    tool_signals_to_choose:
        'Use this tool when you need to analyze code for improvements, detect bugs, or ensure it adheres to coding standards. You can provide either the code directly or a PR (Pull Request) number.',
    tool_parameters: {
        parameter_code: {
            parameter_code_example: 'function add(a, b) { return a + b; }',
            parameter_code_required: false,
            parameter_code_description:
                'A string containing the code snippet to be reviewed.',
        },
        parameter_pr_number: {
            parameter_pr_number_example: '123',
            parameter_pr_number_required: false,
            parameter_pr_number_description:
                'An integer representing the Pull Request number to be reviewed.',
        },
    },
    tool_data_return_structure: {
        feedback: 'string',
    },
};

@Injectable()
export class CodeReviewTool implements ITool<any, IToolResult> {
    constructor(
        @Inject(CODE_BASE_CONFIG_SERVICE_TOKEN)
        private readonly codeBaseConfigService: ICodeBaseConfigService,

        private readonly codeManagementService: CodeManagementService,
        private logger: PinoLoggerService,

        @Inject(PARAMETERS_SERVICE_TOKEN)
        private readonly parametersService: IParametersService,
    ) {}

    get name(): string {
        return CodeReviewTool.name;
    }

    get description(): string {
        return 'Perform a code review and provide feedback on code quality, style, and potential issues.';
    }

    get definition(): object {
        return codeReviewToolDefinition;
    }

    async execute(
        input: any,
        context: ToolExecutionContext,
    ): Promise<IToolResult> {
        try {
            const { organizationAndTeamData, sessionId } = context;

            const code = input?.parameters?.parameter_code;
            let prNumber: string | undefined =
                input?.parameters?.parameter_pr_number;

            let pullRequest: any = {};

            if (!prNumber || (prNumber === '$1' && !code)) {
                if (
                    input?.parameters &&
                    input?.parameters.GetPullRequestsTool
                ) {
                    const pullRequests =
                        input.parameters.GetPullRequestsTool.pullRequests;

                    if (
                        Array.isArray(pullRequests) &&
                        pullRequests.length > 0
                    ) {
                        const latestPullRequest = pullRequests.reduce(
                            (latest, current) => {
                                return new Date(current.author_created_at) >
                                    new Date(latest.author_created_at)
                                    ? current
                                    : latest;
                            },
                        );

                        prNumber =
                            latestPullRequest?.pull_number ||
                            latestPullRequest.id;
                    }
                }
            }

            if (prNumber && prNumber !== '$1') {
                pullRequest = (
                    await this.codeManagementService.getPullRequests({
                        organizationAndTeamData,
                        filters: {
                            pullRequestNumbers: [prNumber],
                            includeChanges: true,
                        },
                    })
                )[0];
            }

            let data =
                Object.keys(pullRequest)?.length > 0
                    ? JSON.stringify(pullRequest.changes)
                    : { code };

            if (!data && input.requirements.length > 0) {
                const pullRequests = input.requirements.find(
                    (r) => r.name === 'GetPullRequestsTool',
                );

                data = pullRequests?.parameters?.parameter_pull_request;
            }

            const response = await this.generateCodeSuggestions(
                organizationAndTeamData,
                sessionId,
            );

            return {
                stringResult: this.formatReturnToPrompt(response),
                jsonResult: response,
            };
        } catch (error) {
            this.logger.error({
                message: 'Error executing CodeReview Tool',
                context: CodeReviewTool.name,
                error: error,
                metadata: {
                    teamId: context.organizationAndTeamData.teamId,
                    organizationId:
                        context.organizationAndTeamData.organizationId,
                },
            });
            return {
                stringResult:
                    'Error executing CodeReviewTool. Please try again.',
                jsonResult: [],
            };
        }
    }

    private formatReturnToPrompt(data: any) {
        return `Code Base data: ${JSON.stringify(data.message)}`;
    }

    private async generateCodeSuggestions(
        organizationAndTeamData: OrganizationAndTeamData,
        sessionId: string,
    ) {
        try {
            const maxRetries = 2;
            let retryCount = 0;

            const codeManagementConfig =
                await this.codeBaseConfigService.getCodeManagementPatConfigAndRepositories(
                    organizationAndTeamData,
                );

            if (!codeManagementConfig?.codeManagementPat) {
                return {
                    message:
                        'Kody does not have read access to the repository.',
                };
            }

            if (codeManagementConfig?.repositories?.length <= 0) {
                return {
                    message:
                        'No configured repositories were found. As Kody, you need to inform the user and ask them to please check connections on the Kodus platform to ensure everything continues to work correctly.',
                };
            }

            while (retryCount < maxRetries) {
                const responseError = '';

                try {
                    return [];
                } catch (error) {
                    this.logger.error({
                        message: `Error search suggestion code retry ${retryCount}:, ${error}`,
                        context: CodeReviewTool.name,
                        error: error,
                        metadata: {
                            organizationAndTeamData,
                            responseError,
                            codeManagementConfig,
                            sessionId,
                        },
                    });

                    retryCount++;
                }
            }
        } catch (error) {
            this.logger.error({
                message: `Error search suggestion code:, ${error}`,
                context: CodeReviewTool.name,
                error: error,
                metadata: {
                    organizationAndTeamData,
                    sessionId,
                },
            });
            throw new Error('Error search suggestion code');
        }
    }
}
