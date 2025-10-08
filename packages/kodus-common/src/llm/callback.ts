/* eslint-disable @typescript-eslint/no-unused-vars */

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { Serialized } from '@langchain/core/load/serializable';
import { BaseMessage, AIMessage } from '@langchain/core/messages';
import { LLMResult, ChatGeneration, Generation } from '@langchain/core/outputs';
import { ChainValues } from '@langchain/core/utils/types';

export type TokenUsage = {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    /** quando disponível (ex.: modelos de reasoning) */
    output_reasoning_tokens?: number;

    /** metadados úteis p/ observabilidade */
    model?: string;
    runId?: string;
    parentRunId?: string;
    runName?: string;
};

type OutputTokenDetails = {
    reasoning_tokens?: number;
    reasoning?: number;
};

type OpenAIStyleTokenUsage = {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    output_token_details?: { reasoning_tokens?: number; reasoning?: number };
};

type AnthropicStyleUsage = {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    output_token_details?: { reasoning_tokens?: number; reasoning?: number };
};

function isOpenAIUsage(u: unknown): u is OpenAIStyleTokenUsage {
    return (
        !!u &&
        ('promptTokens' in (u as any) ||
            'completionTokens' in (u as any) ||
            'totalTokens' in (u as any))
    );
}

type GeminiStyleUsage = {
    /** entrada */
    promptTokenCount?: number;
    /** saída (às vezes) */
    candidatesTokenCount?: number;
    /** saída (variante) */
    completionTokenCount?: number;
    /** total */
    totalTokenCount?: number;
};

type LLMOutputLike = {
    /** OpenAI / compat */
    tokenUsage?: OpenAIStyleTokenUsage;
    /** Anthropic / compat */
    usage?: AnthropicStyleUsage;
    usage_metadata?: AnthropicStyleUsage;
    /** Gemini / Vertex */
    usageMetadata?: GeminiStyleUsage;
};

type MaybeAIMessage = AIMessage & {
    usage_metadata?: {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
        output_token_details?: OutputTokenDetails;
        output_tokens_details?: OutputTokenDetails;
    };
    response_metadata?: {
        tokenUsage?: OpenAIStyleTokenUsage;
        usage?: AnthropicStyleUsage;
    };
};

export class TokenTrackingHandler extends BaseCallbackHandler {
    name = 'TokenTrackingHandler';

    private readonly finalTokenUsages = new Map<string, TokenUsage[]>();
    private readonly completedRuns: string[] = [];
    private readonly inProgressTokenUsages = new Map<
        string,
        Partial<TokenUsage>
    >();
    private readonly activeChains = new Map<string, string>(); // runId -> runName
    private readonly parentRunMap = new Map<string, string>(); // childRunId -> parentRunId

    // ===================== utils =====================

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

    private findAncestorChainName(startRunId?: string): string | undefined {
        let currentRunId: string | undefined = startRunId;
        for (let i = 0; i < 5 && currentRunId; i++) {
            const runName = this.activeChains.get(currentRunId);
            if (runName) return runName;
            currentRunId = this.parentRunMap.get(currentRunId);
        }
        return undefined;
    }

    private firstChatGeneration(result: LLMResult): ChatGeneration | undefined {
        const g0: Generation[] | undefined = result.generations?.[0];
        if (!Array.isArray(g0) || g0.length === 0) return undefined;
        const first = g0[0];
        // Só ChatGeneration tem .message
        return (first as ChatGeneration)?.message
            ? (first as ChatGeneration)
            : undefined;
    }

    // ===================== token usage normalization =====================

    /** Fallback: tenta extrair usage de AIMessage retornado pelo modelo */
    private mergeUsageFromMessage(
        usage: Omit<TokenUsage, 'model' | 'runId' | 'parentRunId'>,
        output: LLMResult,
    ) {
        const first = this.firstChatGeneration(output);
        const msg = first?.message as MaybeAIMessage | undefined;
        if (!msg) return;

        // Padrão UsageMetadata (LangChain)
        const um = msg.usage_metadata;
        if (um) {
            usage.input_tokens ??= um.input_tokens;
            usage.output_tokens ??= um.output_tokens;
            usage.total_tokens ??= um.total_tokens;
            const det = um.output_token_details ?? um.output_tokens_details;
            if (
                det &&
                (det.reasoning_tokens != null || det.reasoning != undefined)
            ) {
                usage.output_reasoning_tokens =
                    det.reasoning_tokens ?? det.reasoning;
            }
        }

        const rm = msg.response_metadata;
        const tu = rm?.tokenUsage ?? rm?.usage;
        if (tu) {
            if (isOpenAIUsage(tu)) {
                usage.input_tokens ??= tu.promptTokens;
                usage.output_tokens ??= tu.completionTokens;
                usage.total_tokens ??=
                    tu.totalTokens ??
                    (tu.promptTokens ?? 0) + (tu.completionTokens ?? 0);
                const det = tu.output_token_details;
                if (det?.reasoning_tokens != null)
                    usage.output_reasoning_tokens = det.reasoning_tokens;
            } else {
                const a = tu;
                usage.input_tokens ??= a.input_tokens;
                usage.output_tokens ??= a.output_tokens;
                usage.total_tokens ??=
                    a.total_tokens ??
                    (a.input_tokens ?? 0) + (a.output_tokens ?? 0);
                const det = a.output_token_details;
                if (det?.reasoning_tokens != null)
                    usage.output_reasoning_tokens = det.reasoning_tokens;
            }
        }
    }

    /**
     * Normaliza formatos:
     * - OpenAI/compat: llmOutput.tokenUsage {promptTokens, completionTokens, totalTokens}
     * - Anthropic: llmOutput.usage / usage_metadata {input_tokens, output_tokens, total_tokens}
     * - Gemini/Vertex: llmOutput.usageMetadata {promptTokenCount, candidatesTokenCount/completionTokenCount, totalTokenCount}
     */
    private extractUsageMetadata(
        output: LLMResult,
    ): Omit<TokenUsage, 'model' | 'runId' | 'parentRunId'> {
        const usage: Omit<TokenUsage, 'model' | 'runId' | 'parentRunId'> = {};
        const o = output?.llmOutput as LLMOutputLike | undefined;

        if (o?.tokenUsage) {
            usage.input_tokens = o.tokenUsage.promptTokens ?? 0;
            usage.output_tokens = o.tokenUsage.completionTokens ?? 0;
            usage.total_tokens =
                o.tokenUsage.totalTokens ??
                (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);

            const det = o.tokenUsage.output_token_details;
            if (det?.reasoning_tokens != null) {
                usage.output_reasoning_tokens = det.reasoning_tokens;
            }
        } else if (o?.usage || o?.usage_metadata) {
            const u = (o.usage ?? o.usage_metadata) as AnthropicStyleUsage;
            usage.input_tokens = u.input_tokens ?? usage.input_tokens;
            usage.output_tokens = u.output_tokens ?? usage.output_tokens;
            usage.total_tokens =
                u.total_tokens ??
                (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);

            const det = u.output_token_details;
            if (det?.reasoning_tokens != null) {
                usage.output_reasoning_tokens = det.reasoning_tokens;
            }
        } else if (o?.usageMetadata) {
            const u = o.usageMetadata;
            usage.input_tokens = u.promptTokenCount ?? usage.input_tokens ?? 0;
            usage.output_tokens =
                u.candidatesTokenCount ??
                u.completionTokenCount ??
                usage.output_tokens ??
                0;
            usage.total_tokens =
                u.totalTokenCount ??
                (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
        }

        // Fallback: tenta puxar do AIMessage
        this.mergeUsageFromMessage(usage, output);

        if (
            usage.total_tokens == null &&
            (usage.input_tokens != null || usage.output_tokens != null)
        ) {
            usage.total_tokens =
                (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
        }
        return usage;
    }

    // ===================== Chains =====================

    handleChainStart(
        chain: Serialized,
        _inputs: ChainValues,
        runId: string,
        parentRunId?: string,
        _tags?: string[],
        _metadata?: Record<string, unknown>,
        _runType?: string,
        runName?: string,
    ) {
        if (runName) this.activeChains.set(runId, runName);
        if (parentRunId) this.parentRunMap.set(runId, parentRunId);
    }

    handleChainEnd(
        _outputs: ChainValues,
        runId: string,
        _parentRunId?: string,
    ) {
        this.activeChains.delete(runId);
        this.parentRunMap.delete(runId);
    }

    handleChainError(_e: Error, runId: string) {
        // limpeza defensiva
        this.activeChains.delete(runId);
        this.inProgressTokenUsages.delete(runId);
        this.parentRunMap.delete(runId);
    }

    // ===================== LLM (completion) =====================

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
            metadata?.ls_model_name ||
            extraParams?.invocation_params?.model ||
            extraParams?.invocation_params?.modelName ||
            // alguns wrappers expõem o model em kwargs
            (llm as unknown as { kwargs?: { model?: string } })?.kwargs
                ?.model ||
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

    handleLLMEnd(output: LLMResult, runId: string, parentRunId?: string) {
        const current = this.inProgressTokenUsages.get(runId);
        if (!current) {
            // nada para agregar (já limpo/erro anterior?)
            return;
        }

        const norm = this.extractUsageMetadata(output);
        const finalUsage: TokenUsage = { ...current, ...norm };

        const runKey = this.getRootRunId(runId);
        const bucket = this.finalTokenUsages.get(runKey) ?? [];
        bucket.push(finalUsage);
        this.finalTokenUsages.set(runKey, bucket);
        if (!this.completedRuns.includes(runKey))
            this.completedRuns.push(runKey);

        this.inProgressTokenUsages.delete(runId);
        this.parentRunMap.delete(runId);
    }

    handleLLMError(_e: Error, runId: string) {
        this.inProgressTokenUsages.delete(runId);
        this.parentRunMap.delete(runId);
    }

    // ===================== ChatModel =====================

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
            metadata?.ls_model_name ||
            extraParams?.invocation_params?.model ||
            extraParams?.invocation_params?.modelName ||
            (llm as unknown as { kwargs?: { model?: string } })?.kwargs
                ?.model ||
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

    handleChatModelEnd(output: LLMResult, runId: string, parentRunId?: string) {
        // mesma lógica do LLMEnd — ChatModels também retornam LLMResult
        this.handleLLMEnd(output, runId, parentRunId);
    }

    handleChatModelError(_e: Error, runId: string) {
        this.inProgressTokenUsages.delete(runId);
        this.parentRunMap.delete(runId);
    }

    // ===================== consumo / reset =====================

    /**
     * Retorna um bucket completo de usages (por run raiz). Se `targetRunName` for passado,
     * tenta priorizar o primeiro bucket que contenha esse nome.
     */
    consumeCompletedRunUsages(targetRunName?: string): {
        runKey: string | null;
        runName?: string;
        usages: TokenUsage[];
    } {
        let runKey: string | null = null;

        if (targetRunName) {
            const idx = this.completedRuns.findIndex((key) => {
                const payload = this.finalTokenUsages.get(key) ?? [];
                return payload.some((u) => u.runName === targetRunName);
            });
            if (idx >= 0) {
                runKey = this.completedRuns.splice(idx, 1)[0] ?? null;
            }
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
