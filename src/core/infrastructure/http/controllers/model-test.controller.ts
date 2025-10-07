import {
    Body,
    Controller,
    Inject,
    Post,
    Req,
    BadRequestException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import {
    AIAnalysisResult,
    AnalysisContext,
    FileChangeContext,
    ReviewModeResponse,
} from '@/config/types/general/codeReview.type';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { BYOKConfig, LLMModelProvider } from '@kodus/kodus-common/llm';
import {
    LLM_ANALYSIS_SERVICE_TOKEN,
    LLMAnalysisService,
} from '@/core/infrastructure/adapters/services/codeBase/llmAnalysis.service';
import { PermissionValidationService } from '@/ee/shared/services/permissionValidation.service';

type TestModelsRequest = {
    teamId: string;
    organizationId: string;
    prNumber?: number;
    provider?: LLMModelProvider | string;
    model?: string;
    fallbackProvider?: LLMModelProvider | string;
    fallbackModel?: string;
    reviewMode?: ReviewModeResponse;
    simulate?: boolean;
    file?: {
        filename?: string;
        language?: string;
        content?: string;
        patch?: string;
    };
};

@Controller('debug-models')
export class ModelTestController {
    constructor(
        @Inject(LLM_ANALYSIS_SERVICE_TOKEN)
        private readonly llmAnalysisService: LLMAnalysisService,

        private readonly permissionValidationService: PermissionValidationService,

        @Inject(REQUEST)
        private readonly request: Request & {
            user?: { organization?: { uuid?: string } };
        },
    ) {}

    @Post('test')
    async testModels(
        @Body() body: TestModelsRequest,
    ): Promise<AIAnalysisResult> {
        const organizationId =
            body?.organizationId ?? this.request?.user?.organization?.uuid;
        if (!organizationId) {
            throw new BadRequestException(
                'organizationId not found in request',
            );
        }

        if (!body?.teamId) {
            throw new BadRequestException('teamId is required');
        }

        const prNumber = body?.prNumber ?? 1;
        const reviewMode = body?.reviewMode ?? ReviewModeResponse.HEAVY_MODE;

        const organizationAndTeamData: OrganizationAndTeamData = {
            organizationId,
            teamId: body.teamId,
        };

        // Fetch BYOK from DB
        const fromDb = await this.permissionValidationService.getBYOKConfig(
            organizationAndTeamData,
        );

        if (!fromDb) {
            throw new BadRequestException(
                'BYOK config not found for organization/team',
            );
        }

        // Override provider/model if supplied
        const byokConfig: BYOKConfig = {
            ...fromDb,
            main: {
                ...fromDb.main,
                provider:
                    (body?.provider as LLMModelProvider) ??
                    fromDb.main?.provider,
                model: body?.model ?? fromDb.main?.model,
            },
            fallback: fromDb.fallback
                ? {
                      ...fromDb.fallback,
                      provider:
                          (body?.fallbackProvider as LLMModelProvider) ??
                          fromDb.fallback?.provider,
                      model: body?.fallbackModel ?? fromDb.fallback?.model,
                  }
                : undefined,
        } as BYOKConfig;

        // Minimal mocked file context
        const filename = body?.file?.filename ?? 'src/example.ts';
        const language = body?.file?.language ?? 'typescript';
        const content =
            body?.file?.content ??
            `export function add(a: number, b: number) {\n  return a + b;\n}`;
        const patch =
            body?.file?.patch ??
            `@@ -1,3 +1,4 @@\n export function add(a: number, b: number) {\n   return a + b;\n }\n+// TODO: improve error handling`;

        const fileContext: FileChangeContext = {
            file: {
                content,
                sha: 'mock-sha',
                filename,
                status: 'modified',
                additions: 1,
                deletions: 0,
                changes: 1,
                blob_url: 'https://example.com/blob',
                raw_url: 'https://example.com/raw',
                contents_url: 'https://example.com/contents',
                patch,
                fileContent: content,
                reviewMode,
                patchWithLinesStr: patch,
            },
            relevantContent: content,
            patchWithLinesStr: patch,
        };

        const context: AnalysisContext = {
            pullRequest: { number: prNumber } as any,
            repository: {
                id: 'mock-repo-id',
                name: 'mock-repo',
                language,
                defaultBranch: 'main',
            },
            organizationAndTeamData,
            platformType: 'github',
            action: 'opened',
            correlationId: `${Date.now()}-${Math.random()}`,
        };

        if (body?.simulate) {
            // Return a mocked analysis to avoid calling external providers
            return {
                codeSuggestions: [
                    {
                        id: 'mock-1',
                        relevantFile: filename,
                        language,
                        suggestionContent:
                            'Consider adding input validation and error handling.',
                        improvedCode: `export function add(a: number, b: number) {\n  if (typeof a !== 'number' || typeof b !== 'number') {\n    throw new TypeError('Inputs must be numbers');\n  }\n  return a + b;\n}`,
                        oneSentenceSummary:
                            'Adds basic validation and error handling to add()',
                        relevantLinesStart: 1,
                        relevantLinesEnd: 5,
                        label: 'maintainability',
                        severity: 'low',
                        rankScore: 0.7,
                    },
                ],
                codeReviewModelUsed: {
                    generateSuggestions:
                        (body?.provider as string) ||
                        byokConfig?.main?.provider,
                },
            };
        }

        // Live execution using configured BYOK
        return this.llmAnalysisService.analyzeCodeWithAI_v2(
            organizationAndTeamData,
            prNumber,
            fileContext,
            reviewMode,
            context,
            byokConfig,
        );
    }
}
