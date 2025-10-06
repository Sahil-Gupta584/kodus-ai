/* eslint-disable @typescript-eslint/no-unused-vars */

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { Serialized } from '@langchain/core/load/serializable';
import { LLMResult } from '@langchain/core/outputs';
import { ChainValues } from '@langchain/core/utils/types';

export type TokenUsage = {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    model?: string;
    runId?: string;
    parentRunId?: string;
    output_reasoning_tokens?: number;
    runName?: string;
};

export class TokenTrackingHandler extends BaseCallbackHandler {
    name = 'TokenTrackingHandler';

    private finalTokenUsages: TokenUsage[] = [];
    private readonly inProgressTokenUsages: Map<string, Partial<TokenUsage>> =
        new Map();
    private readonly activeChains: Map<string, string> = new Map();
    private readonly parentRunMap: Map<string, string> = new Map();

    private extractUsageMetadata(
        output: LLMResult,
    ): Omit<TokenUsage, 'model' | 'runId' | 'parentRunId'> {
        try {
            const usage: Omit<TokenUsage, 'model' | 'runId' | 'parentRunId'> =
                {};
            let copyUsage: Record<string, any> = {};

            if (output?.llmOutput?.tokenUsage) {
                copyUsage = output.llmOutput.tokenUsage as Record<string, any>;

                Object.assign(usage, output.llmOutput.tokenUsage);
            } else if (output?.llmOutput?.usage) {
                Object.assign(usage, output.llmOutput.usage);
            } else if (output?.llmOutput?.usage_metadata) {
                Object.assign(usage, output.llmOutput.usage_metadata);
            }

            if (
                copyUsage.totalTokens &&
                copyUsage.promptTokens &&
                copyUsage.completionTokens
            ) {
                usage.total_tokens = copyUsage.totalTokens as number;
                usage.input_tokens = copyUsage.promptTokens as number;
                usage.output_tokens = copyUsage.completionTokens as number;
            }

            if (
                !usage.total_tokens ||
                !usage.input_tokens ||
                !usage.output_tokens
            ) {
                console.warn(
                    'Failed to extract complete token usage info from LLM output.',
                    usage,
                    output,
                );
            }

            return usage;
        } catch (error) {
            console.error('Error extracting usage metadata:', error);
            return {};
        }
    }

    handleChainStart(
        chain: Serialized,
        inputs: ChainValues,
        runId: string,
        parentRunId?: string,
        tags?: string[],
        metadata?: Record<string, unknown>,
        runType?: string,
        runName?: string,
    ) {
        if (runName) {
            this.activeChains.set(runId, runName);
        }
        if (parentRunId) {
            this.parentRunMap.set(runId, parentRunId);
        }
    }

    handleChainEnd(
        outputs: ChainValues,
        runId: string,
        parentRunId?: string,
        tags?: string[],
        kwargs?: { inputs?: Record<string, unknown> },
    ) {
        this.activeChains.delete(runId);
        this.parentRunMap.delete(runId);
    }

    private findAncestorChainName(startRunId: string): string | undefined {
        let currentRunId: string | undefined = startRunId;

        // Loop up to 5 levels deep to prevent infinite loops
        for (let i = 0; i < 5 && currentRunId; i++) {
            // Check if the current ID is an active, named chain
            const runName = this.activeChains.get(currentRunId);
            if (runName) {
                return runName;
            }
            // If not, move up to the parent
            currentRunId = this.parentRunMap.get(currentRunId);
        }

        return undefined;
    }

    handleLLMStart(
        llm: Serialized,
        prompts: string[],
        runId: string,
        parentRunId?: string,
        extraParams?: Record<string, unknown> & {
            invocation_params?: {
                model?: string;
                modelName?: string;
            };
        },
        tags?: string[],
        metadata?: Record<string, unknown> & {
            ls_model_name?: string;
        },
        runName?: string,
    ) {
        const model =
            llm?.name ||
            metadata?.ls_model_name ||
            extraParams?.invocation_params?.model ||
            extraParams?.invocation_params?.modelName ||
            'unknown';

        if (!model || model === 'unknown') {
            console.warn(
                'Model name is unknown. Cannot track token usage accurately.',
                {
                    llm,
                    metadata,
                    extraParams,
                },
            );
        }

        const usage: Partial<TokenUsage> = {
            model,
            runId,
            parentRunId,
        };

        if (runName) {
            usage.runName = runName;
        } else if (parentRunId) {
            usage.runName = this.findAncestorChainName(parentRunId);
        }

        this.inProgressTokenUsages.set(runId, usage);
    }

    handleLLMEnd(
        output: LLMResult,
        runId: string,
        parentRunId?: string,
        tags?: string[],
        extraParams?: Record<string, unknown>,
    ) {
        const currentTokenUsage = this.inProgressTokenUsages.get(runId);

        if (!currentTokenUsage) {
            console.warn(
                'No in-progress token usage found for LLM end event.',
                { output, runId, parentRunId },
            );
            return;
        }

        const usageMetadata = this.extractUsageMetadata(output);

        const finalUsage: TokenUsage = {
            ...currentTokenUsage,
            ...usageMetadata,
        };

        this.finalTokenUsages.push(finalUsage);
        this.inProgressTokenUsages.delete(runId);
    }

    getTokenUsages(): TokenUsage[] {
        return [...this.finalTokenUsages];
    }

    reset() {
        this.finalTokenUsages = [];
        this.inProgressTokenUsages.clear();
        this.activeChains.clear();
        this.parentRunMap.clear();
    }
}
