/* eslint-disable @typescript-eslint/no-unused-vars */

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { Serialized } from '@langchain/core/load/serializable';
import { LLMResult } from '@langchain/core/outputs';
import { ChainValues } from '@langchain/core/utils/types';
import { BaseMessage } from '@langchain/core/messages';

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

    private readonly finalTokenUsages: Map<string, TokenUsage[]> = new Map();
    private readonly completedRuns: string[] = [];
    private readonly inProgressTokenUsages: Map<string, Partial<TokenUsage>> =
        new Map();
    private readonly activeChains: Map<string, string> = new Map();
    private readonly parentRunMap: Map<string, string> = new Map();

    // ---------- utils ----------

    private getRootRunId(runId: string): string {
        const visited = new Set<string>();
        let current: string | undefined = runId;
        while (
            current &&
            this.parentRunMap.has(current) &&
            !visited.has(current)
        ) {
            visited.add(current);
            const parent = this.parentRunMap.get(current);
            if (!parent) break;
            current = parent;
        }
        return current ?? runId;
    }

    private findAncestorChainName(startRunId: string): string | undefined {
        let currentRunId: string | undefined = startRunId;
        for (let i = 0; i < 5 && currentRunId; i++) {
            const runName = this.activeChains.get(currentRunId);
            if (runName) return runName;
            currentRunId = this.parentRunMap.get(currentRunId);
        }
        return undefined;
    }

    // ---------- token usage normalization ----------

    /** tenta extrair usage também do AIMessage da geração, como fallback */
    private mergeUsageFromMessage(
        usage: Omit<TokenUsage, 'model' | 'runId' | 'parentRunId'>,
        output: LLMResult,
    ) {
        const gens = (output as any)?.generations;
        const firstGen: any = Array.isArray(gens)
            ? Array.isArray(gens[0])
                ? gens[0][0]
                : gens[0]
            : undefined;
        const msg = firstGen?.message;

        // AIMessage.usage_metadata (padronizado pelo LangChain)
        if (msg?.usage_metadata) {
            usage.input_tokens ??= msg.usage_metadata.input_tokens;
            usage.output_tokens ??= msg.usage_metadata.output_tokens;
            usage.total_tokens ??= msg.usage_metadata.total_tokens;

            // reasoning tokens (quando presentes)
            const outDet = msg.usage_metadata?.output_token_details;
            if (outDet?.reasoning_tokens != null) {
                (usage as any).output_reasoning_tokens =
                    outDet.reasoning_tokens;
            }
        }

        // AIMessage.response_metadata.tokenUsage (OpenAI-style)
        const rm = msg?.response_metadata ?? {};
        const tu = rm?.tokenUsage ?? rm?.usage ?? undefined;
        if (tu) {
            usage.input_tokens ??= tu.promptTokens ?? tu.input_tokens;
            usage.output_tokens ??= tu.completionTokens ?? tu.output_tokens;
            usage.total_tokens ??= tu.totalTokens ?? tu.total_tokens;
            const det = tu.output_token_details ?? tu.outputTokenDetails;
            if (det?.reasoning_tokens != null) {
                (usage as any).output_reasoning_tokens = det.reasoning_tokens;
            }
        }
    }

    /**
     * Normaliza formatos comuns:
     * - OpenAI / OpenAI-compatível: llmOutput.tokenUsage {promptTokens, completionTokens, totalTokens}
     * - Anthropic: llmOutput.usage/usage_metadata {input_tokens, output_tokens, total_tokens}
     * - Gemini / Vertex: llmOutput.usageMetadata {promptTokenCount, candidatesTokenCount, totalTokenCount}
     */
    private extractUsageMetadata(
        output: LLMResult,
    ): Omit<TokenUsage, 'model' | 'runId' | 'parentRunId'> {
        try {
            const usage: Omit<TokenUsage, 'model' | 'runId' | 'parentRunId'> =
                {};
            const o: any = output?.llmOutput ?? {};

            if (o?.tokenUsage) {
                // OpenAI / compat.
                usage.input_tokens = o.tokenUsage.promptTokens ?? 0;
                usage.output_tokens = o.tokenUsage.completionTokens ?? 0;
                usage.total_tokens =
                    o.tokenUsage.totalTokens ??
                    (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
            } else if (o?.usage || o?.usage_metadata) {
                // Anthropic / outros
                const u = o.usage ?? o.usage_metadata;
                usage.input_tokens =
                    u.input_tokens ?? u.prompt_tokens ?? usage.input_tokens;
                usage.output_tokens =
                    u.output_tokens ??
                    u.completion_tokens ??
                    usage.output_tokens;
                usage.total_tokens =
                    u.total_tokens ??
                    (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);

                const outDet = u?.output_token_details ?? u?.outputTokenDetails;
                if (outDet?.reasoning_tokens != null) {
                    (usage as any).output_reasoning_tokens =
                        outDet.reasoning_tokens;
                }
            } else if (o?.usageMetadata) {
                // Google Gemini / Vertex
                const u = o.usageMetadata;
                usage.input_tokens =
                    u.promptTokenCount ?? usage.input_tokens ?? 0;
                usage.output_tokens =
                    u.candidatesTokenCount ??
                    u.completionTokenCount ??
                    usage.output_tokens ??
                    0;
                usage.total_tokens =
                    u.totalTokenCount ??
                    (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
            }

            // fallback: tenta puxar do AIMessage
            this.mergeUsageFromMessage(usage, output);

            if (
                usage.total_tokens == null &&
                (usage.input_tokens != null || usage.output_tokens != null)
            ) {
                usage.total_tokens =
                    (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
            }
            return usage;
        } catch {
            return {};
        }
    }

    // ---------- chains ----------

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
        if (runName) this.activeChains.set(runId, runName);
        if (parentRunId) this.parentRunMap.set(runId, parentRunId);
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

    // ---------- LLMs puros ----------

    handleLLMStart(
        llm: Serialized,
        _prompts: string[],
        runId: string,
        parentRunId?: string,
        extraParams?: Record<string, unknown> & {
            invocation_params?: { model?: string; modelName?: string };
        },
        _tags?: string[],
        metadata?: Record<string, unknown> & { ls_model_name?: string },
        runName?: string,
    ) {
        const model =
            (metadata as any)?.ls_model_name ||
            extraParams?.invocation_params?.model ||
            extraParams?.invocation_params?.modelName ||
            (llm as any)?.kwargs?.model ||
            llm?.name ||
            'unknown';

        const usage: Partial<TokenUsage> = {
            model,
            runId,
            parentRunId,
            runName:
                runName ??
                (parentRunId
                    ? this.findAncestorChainName(parentRunId)
                    : undefined),
        };

        if (parentRunId) this.parentRunMap.set(runId, parentRunId);
        this.inProgressTokenUsages.set(runId, usage);
    }

    handleLLMEnd(
        output: LLMResult,
        runId: string,
        parentRunId?: string,
        _tags?: string[],
        _extraParams?: Record<string, unknown>,
    ) {
        const current = this.inProgressTokenUsages.get(runId);
        if (!current) {
            console.warn(
                'No in-progress token usage found for LLM end event.',
                { runId, parentRunId },
            );
            return;
        }

        const usage = this.extractUsageMetadata(output);
        const finalUsage: TokenUsage = { ...current, ...usage };

        const runKey = this.getRootRunId(runId);
        const bucket = this.finalTokenUsages.get(runKey) ?? [];
        bucket.push(finalUsage);
        this.finalTokenUsages.set(runKey, bucket);
        if (!this.completedRuns.includes(runKey))
            this.completedRuns.push(runKey);

        this.inProgressTokenUsages.delete(runId);
        this.parentRunMap.delete(runId);
    }

    // ---------- Chat models ----------

    handleChatModelStart(
        llm: Serialized,
        _messages: BaseMessage[][],
        runId: string,
        parentRunId?: string,
        extraParams?: Record<string, unknown> & {
            invocation_params?: { model?: string; modelName?: string };
        },
        _tags?: string[],
        metadata?: Record<string, unknown> & { ls_model_name?: string },
        runName?: string,
    ) {
        const model =
            (metadata as any)?.ls_model_name ||
            extraParams?.invocation_params?.model ||
            extraParams?.invocation_params?.modelName ||
            (llm as any)?.kwargs?.model ||
            llm?.name ||
            'unknown';

        const usage: Partial<TokenUsage> = {
            model,
            runId,
            parentRunId,
            runName:
                runName ??
                (parentRunId
                    ? this.findAncestorChainName(parentRunId)
                    : undefined),
        };

        if (parentRunId) this.parentRunMap.set(runId, parentRunId);
        this.inProgressTokenUsages.set(runId, usage);
    }

    // ---------- consumo / reset ----------

    consumeCompletedRunUsages(targetRunName?: string): {
        runKey: string | null;
        runName?: string;
        usages: TokenUsage[];
    } {
        let runKey: string | null = null;

        if (targetRunName) {
            const index = this.completedRuns.findIndex((key) => {
                const payload = this.finalTokenUsages.get(key) ?? [];
                return payload.some((u) => u.runName === targetRunName);
            });
            if (index >= 0)
                runKey = this.completedRuns.splice(index, 1)[0] ?? null;
        }

        if (!runKey) runKey = this.completedRuns.shift() ?? null;
        if (!runKey) return { runKey: null, runName: undefined, usages: [] };

        const usages = this.finalTokenUsages.get(runKey) ?? [];
        this.finalTokenUsages.delete(runKey);

        const runName = usages.find((u) => u.runName)?.runName;
        return { runKey, runName, usages: [...usages] };
    }

    getTokenUsages(runKey?: string): TokenUsage[] {
        if (runKey) return [...(this.finalTokenUsages.get(runKey) ?? [])];
        return Array.from(this.finalTokenUsages.values()).flatMap((u) => [
            ...u,
        ]);
    }

    reset(runKey?: string) {
        if (runKey) {
            this.finalTokenUsages.delete(runKey);
            const i = this.completedRuns.indexOf(runKey);
            if (i >= 0) this.completedRuns.splice(i, 1);
        } else {
            this.finalTokenUsages.clear();
            this.completedRuns.length = 0;
        }
        this.inProgressTokenUsages.clear();
        this.activeChains.clear();
        this.parentRunMap.clear();
    }
}
