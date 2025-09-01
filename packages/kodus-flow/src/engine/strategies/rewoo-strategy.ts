import { LLMAdapter } from '../../core/types/allTypes.js';
import { RewooEvidenceItem } from './prompts/index.js';
import { createLogger } from '../../observability/index.js';
import { BaseExecutionStrategy } from './strategy-interface.js';
import { SharedStrategyMethods } from './shared-methods.js';
import type {
    StrategyExecutionContext,
    ExecutionResult,
    ExecutionStep,
} from './types.js';
import { StrategyPromptFactory } from './prompts/index.js';

/**
 * ReWoo Strategy - Reasoning Without Observation
 *
 * Implementação limpa e funcional do padrão ReWoo.
 * Mantém uma arquitetura simples mas robusta.
 *
 * Padrão: Plan → Execute → Synthesize
 */

// =============================================================================
// 🎯 REWOO STRATEGY - NOVA ARQUITETURA DE PROMPTS
// =============================================================================
// ✅ Todos os prompts agora são gerenciados pela StrategyPromptFactory
// ✅ Usa os formatadores da nova arquitetura
// ✅ Removidos: SYSTEM_SKETCH, USER_SKETCH, SYSTEM_ORGANIZE, USER_ORGANIZE
// ✅ Removidos: SYSTEM_VERIFY, USER_VERIFY
// ✅ Removida: função truncate (usa StrategyFormatters.smartTruncate)

// ------------------------
// Utilities
// ------------------------

function safeJsonParse<T = any>(text: string): T | null {
    try {
        // strip possible markdown fences
        const cleaned = text
            .trim()
            .replace(/^```(json)?/i, '')
            .replace(/```$/i, '');
        return JSON.parse(cleaned) as T;
    } catch {
        return null;
    }
}

export class ReWooStrategy extends BaseExecutionStrategy {
    private readonly logger = createLogger('rewoo-strategy');
    private readonly promptFactory: StrategyPromptFactory;

    private readonly config = {
        maxPlanningSteps: 10,
        maxExecutionSteps: 15,
        maxToolCalls: 25,
        maxExecutionTime: 300000, // 5 minutos
        enablePlanValidation: true,
    };

    constructor(
        private llmAdapter: LLMAdapter,
        options: {
            maxPlanningSteps?: number;
            maxExecutionSteps?: number;
            maxToolCalls?: number;
            maxExecutionTime?: number;
            enablePlanValidation?: boolean;
            llmAdapter?: LLMAdapter;
        } = {},
    ) {
        super();

        // Inicializar prompt factory
        this.promptFactory = new StrategyPromptFactory();

        const defaultConfig = {
            maxPlanningSteps: 10,
            maxExecutionSteps: 15,
            maxToolCalls: 25,
            maxExecutionTime: 300000,
            enablePlanValidation: true,
        };

        this.config = { ...defaultConfig, ...options };

        // TODO: Revisar configs passadas.
        // this.promptComposer = new PlannerPromptComposer({
        //     additionalPatterns: [],
        //     constraints: [],
        //     features: {
        //         enablePromptCaching: false,
        //     },
        // });

        // this.replanPolicy = {
        //     maxReplans: 5,
        //     toolUnavailable: 'replan',
        // };

        this.logger.info('🏗️ ReWoo Strategy initialized', {
            config: this.config,
        });
    }

    /**
     * Método principal - executa o padrão ReWoo completo
     */
    // async execute(context: StrategyExecutionContext): Promise<ExecutionResult> {
    //     const startTime = Date.now();
    //     const steps: ExecutionStep[] = [];
    //     let toolCallsCount = 0;

    //     try {
    //         this.validateContext(context);

    //         // Fase 1: PLAN - Criar plano estratégico
    //         const plan = await this.createStrategicPlan(context);
    //         steps.push(this.createPlanStep(plan));

    //         // Fase 2: EXECUTE - Executar plano step by step
    //         const executionResults = await this.executePlanSteps(
    //             plan,
    //             context,
    //             startTime,
    //         );
    //         steps.push(...executionResults.steps);
    //         toolCallsCount = executionResults.toolCallsCount;

    //         // Fase 3: SYNTHESIZE - Sintetizar resultados
    //         const synthesisResult = await this.synthesizeResults(
    //             steps,
    //             context,
    //         );

    //         return this.buildSuccessResult(
    //             synthesisResult,
    //             steps,
    //             startTime,
    //             toolCallsCount,
    //         );
    //     } catch (error) {
    //         return this.buildErrorResult(
    //             error,
    //             steps,
    //             startTime,
    //             toolCallsCount,
    //         );
    //     }
    // }
    defaultRewooConfig: Required<any> = {
        topKSketches: 4,
        maxParallelWork: 4,
        overallTimeoutMs: 120_000,
        perWorkTimeoutMs: 25_000,
        perLLMTimeoutMs: 20_000,
        maxVerifyPasses: 1,
        requireEvidenceAnchors: true,
        temperatureSketch: 0.4,
        temperatureOrganize: 0.3,
        temperatureVerify: 0.2,
    };
    async execute(context: StrategyExecutionContext): Promise<ExecutionResult> {
        const start = Date.now();
        const steps: ExecutionStep[] = [];
        const config = { ...this.defaultRewooConfig };

        // 1) SKETCH --------------------------------------------------
        const sketchStepStart = Date.now();
        const sketches = await this.sketch(context, config).catch((e) => {
            throw new Error(
                `Sketch failed: ${e instanceof Error ? e.message : String(e)}`,
            );
        });
        steps.push({
            id: `sketch-${sketchStepStart}`,
            type: 'sketch' as any,
            type2: 'sketch',
            timestamp: sketchStepStart,
            duration: Date.now() - sketchStepStart,
            status: 'completed',
            thought2: `Generated ${sketches.length} sub-questions`,
            result2: sketches,
        });

        // 2) WORK (parallel tools) -----------------------------------
        const workStart = Date.now();
        const evidences = await this.work(sketches, context, config);
        steps.push({
            id: `work-${workStart}`,
            type: 'work' as any,
            type2: 'work',
            timestamp: workStart,
            duration: Date.now() - workStart,
            status: 'completed',
            result2: evidences,
        });

        // 3) ORGANIZE -------------------------------------------------
        const organizeStart = Date.now();
        const organized = await this.organize(context, evidences, config).catch(
            (e) => {
                throw new Error(
                    `Organize failed: ${e instanceof Error ? e.message : String(e)}`,
                );
            },
        );
        steps.push({
            id: `organize-${organizeStart}`,
            type: 'organize' as any,
            type2: 'organize',
            timestamp: organizeStart,
            duration: Date.now() - organizeStart,
            status: 'completed',
            result2: organized,
        });

        // 4) VERIFY (optional loop) ----------------------------------
        const finalAnswer = organized.answer;
        // let verification: RewooVerificationReport | null = null;

        // for (let pass = 0; pass < config.maxVerifyPasses; pass++) {
        //     const verifyStart = Date.now();
        //     verification = await this.verify(
        //         ctx.input,
        //         organized,
        //         evidences,
        //         config,
        //     ).catch(() => null);
        //     steps.push({
        //         id: `verify-${verifyStart}`,
        //         type: 'verify',
        //         timestamp: verifyStart,
        //         duration: Date.now() - verifyStart,
        //         status: verification ? 'completed' : 'failed',
        //         result: verification ?? {
        //             verified: false,
        //             score: 0,
        //             issues: ['verification failed'],
        //         },
        //     });

        //     if (!verification) break;
        //     if (verification.verified && verification.score >= 0.75) {
        //         finalAnswer = verification.normalizedAnswer || organized.answer;
        //         break;
        //     }

        //     // If not verified, attempt a single corrective organize using issues
        //     if (verification.issues && verification.issues.length) {
        //         const corrective = await this.organize(
        //             ctx.input +
        //                 '\nConstraints:' +
        //                 verification.issues.join('; '),
        //             evidences,
        //             config,
        //         ).catch(() => organized);
        //         organized.answer = corrective.answer;
        //         organized.citations = corrective.citations;
        //         organized.confidence = Math.max(
        //             organized.confidence,
        //             corrective.confidence,
        //         );
        //         finalAnswer = organized.answer;
        //     }
        // }

        const execTime = Date.now() - start;
        return {
            output: finalAnswer,
            success: true,
            strategy: 'rewoo',
            steps,
            executionTime: execTime,
            complexity: steps.length,
            metadata: {
                citations: organized.citations,
                // TODO: Revisar confidence.
                // confidence: (verification?.score ?? organized.confidence) || 0,
                evidenceCount: evidences.length,
            },
        };
    }

    private async sketch(
        context: StrategyExecutionContext,
        cfg: any,
    ): Promise<any[]> {
        if (!this.llmAdapter.createPlan) {
            throw new Error('LLM adapter must support createPlan method');
        }

        // Usar nova arquitetura de prompts
        const prompts = this.promptFactory.createReWooPrompt({
            goal: context.input,
            tools: context.tools as any,
            agentContext: context.agentContext,
            additionalContext:
                context.agentContext?.agentExecutionOptions?.userContext,
            mode: 'planner',
        });

        const res = await this.llmAdapter.createPlan(
            context.input,
            'plan-execute',
            {
                systemPrompt: prompts.systemPrompt,
                userPrompt: prompts.userPrompt,
                tools: this.getAvailableToolsFormatted(context),
            },
        );
        const parsed = safeJsonParse<{ sketches: Array<any> }>(
            (res as any)?.content,
        ) || {
            sketches: [],
        };
        // console.log('parsed', parsed); // Commented out for production
        // sanitize & cap
        const unique: any[] = [];
        const seen = new Set<string>();
        for (const s of parsed.sketches.slice(0, cfg.topKSketches)) {
            const id = s.id?.trim() || `S${unique.length + 1}`;
            if (seen.has(id)) continue;
            seen.add(id);
            unique.push({
                id,
                query: s.query?.trim() || '',
                tool: s.tool || undefined,
                arguments: s.arguments || undefined,
            });
        }
        if (!unique.length) throw new Error('no sketches produced by model');
        return unique;
    }

    private async work(
        sketches: any[],
        ctx: StrategyExecutionContext,
        cfg: any,
    ): Promise<RewooEvidenceItem[]> {
        const evidences: RewooEvidenceItem[] = [];
        const toolMap = new Map(ctx.tools.map((t) => [t.name, t] as const));

        // Simple concurrency gate
        const queue = [...sketches];
        const workers: Promise<void>[] = [];

        const runOne = async (sk: any, index: number) => {
            const tool = (sk.tool && toolMap.get(sk.tool)) || ctx.tools[0]; // fallback to first tool if not provided
            const evId = `E${index + 1}`;
            const began = Date.now();
            const input = (sk.arguments ?? { query: sk.query }) as Record<
                string,
                unknown
            >;
            let output: unknown;
            let error: string | undefined;
            try {
                // 🔥 USAR SHARED METHODS PARA EXECUÇÃO DE TOOLS
                const action = {
                    type: 'tool_call' as const,
                    toolName: tool.name,
                    input: input,
                };

                output = await SharedStrategyMethods.executeTool(action, ctx);
            } catch (e) {
                error = e instanceof Error ? e.message : String(e);
            }
            evidences.push({
                id: evId,
                sketchId: sk.id,
                toolName: tool.name,
                input,
                output,
                error,
                latencyMs: Date.now() - began,
            });
        };

        while (queue.length || workers.length) {
            while (queue.length && workers.length < cfg.maxParallelWork) {
                const sk = queue.shift()!;
                const p = runOne(sk, evidences.length).finally(() => {
                    const i = workers.indexOf(p);
                    if (i >= 0) {
                        void workers.splice(i, 1);
                    }
                });

                // Intentional: managing concurrent promises

                workers.push(p);
            }
            if (workers.length) {
                await Promise.race(workers).catch(() => {});
            }
        }

        return evidences;
    }

    private async organize(
        context: StrategyExecutionContext,
        evidences: RewooEvidenceItem[],
        cfg: any,
    ): Promise<{ answer: string; citations: string[]; confidence: number }> {
        if (!this.llmAdapter.createPlan) {
            throw new Error('LLM adapter must support createPlan method');
        }
        // Usar nova arquitetura de prompts
        const prompts = this.promptFactory.createReWooPrompt({
            goal: context.input,
            tools: [], // Organizer não precisa de tools
            agentContext: context.agentContext,
            evidences,
            mode: 'organizer',
        });

        const res = await this.llmAdapter.createPlan(
            context.input,
            'plan-execute',
            {
                systemPrompt: prompts.systemPrompt,
                userPrompt: prompts.userPrompt,
                tools: [], // Organizer não usa tools
            },
        );
        const parsed =
            safeJsonParse<{
                answer: string;
                citations?: string[];
                confidence?: number;
            }>((res as any)?.content) || ({ answer: '' } as any);

        // enforce evidence anchors if configured
        const citations = parsed.citations ?? [];
        if (cfg.requireEvidenceAnchors && citations.length === 0) {
            // minimal auto-cite: include all evidence ids seen
            parsed.citations = evidences.map((e) => e.id).slice(0, 6);
        }

        return {
            answer: parsed.answer ?? '',
            citations: parsed.citations ?? [],
            confidence: parsed.confidence ?? 0.5,
        };
    }

    /**
     * Valida contexto de entrada
     */
    // private validateContext(context: StrategyExecutionContext): void {
    //     if (!context.input?.trim()) {
    //         throw new Error('Input cannot be empty');
    //     }

    //     if (!Array.isArray(context.tools)) {
    //         throw new Error('Tools must be an array');
    //     }
    // }

    // /**
    //  * Cria plano estratégico
    //  */
    // private async createStrategicPlan(
    //     context: StrategyExecutionContext,
    // ): Promise<ExecutionPlan> {
    //     const planningPrompt = this.buildPlanningPrompt(context);
    //     const planResponse = await this.callPlanningLLM(planningPrompt);

    //     const plan: ExecutionPlan = {
    //         id: `plan-${Date.now()}`,
    //         goal: context.input,
    //         strategy: 'rewoo',
    //         steps: this.parsePlanSteps(planResponse.steps, context),
    //         reasoning: planResponse.reasoning,
    //         status: 'created',
    //         createdAt: new Date(),
    //         updatedAt: new Date(),
    //     };

    //     if (this.config.enablePlanValidation) {
    //         this.validatePlan(plan, context);
    //     }

    //     return plan;
    // }

    // async think(context: StrategyExecutionContext): Promise<AgentThought> {
    //     try {
    //         if (!context.agentContext) {
    //             throw new Error('AgentContext is required for plan creation');
    //         }
    //         const result = await this.createPlan(context);

    //         return {
    //             reasoning: 'No plan available; please replan',
    //             action: { type: 'final_answer', content: 'Replanning…' },
    //         };
    //     } catch (error) {
    //         this.logger.error(
    //             'Plan-and-Execute thinking failed',
    //             error as Error,
    //         );

    //         return {
    //             reasoning: `Error in planning: ${error instanceof Error ? error.message : 'Unknown error'}`,
    //             action: {
    //                 type: 'final_answer',
    //                 content: `I encountered an error while planning: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
    //             },
    //         };
    //     }
    // }

    // public async createPlan(context: StrategyExecutionContext): Promise<Plan> {
    //     const input = context.input;

    //     const agentIdentity = context.agentContext?.agentIdentity;

    //     if (!this.llmAdapter.createPlan) {
    //         throw new Error('LLM adapter must support createPlan method');
    //     }

    //     // const allSteps = [];
    //     // const currentPlan = this.getCurrentPlan(context);

    //     // const replanContext = this.buildReplanContextFromFreshData(
    //     //     context,
    //     //     allSteps,
    //     //     currentPlan,
    //     // );

    //     const composedPrompt = await this.promptComposer.composePrompt({
    //         goal: input,
    //         availableTools: this.getAvailableToolsFormatted(context),
    //         // TODO: Revisar memoryContext.
    //         // memoryContext,
    //         additionalContext: {
    //             ...context.plannerMetadata,
    //             agentIdentity,
    //             userContext:
    //                 context.agentContext?.agentExecutionOptions?.userContext,
    //         },
    //         // TODO: Revisar replanContext.
    //         // replanContext: replanContext as ReplanContext | undefined,
    //     });

    //     const planResult = await this.llmAdapter.createPlan(
    //         input,
    //         'plan-execute',
    //         {
    //             systemPrompt: composedPrompt.systemPrompt,
    //             userPrompt: composedPrompt.userPrompt,
    //             tools: this.getAvailableToolsFormatted(context),
    //         },
    //     );

    //     const plan = planResult;

    //     const steps = this.convertLLMResponseToSteps(plan);

    //     const now = Date.now();
    //     const newPlan: ExecutionPlan = {
    //         id: `plan-${now}`,
    //         goal: input,
    //         strategy: 'plan-execute',
    //         steps: steps,
    //         currentStepIndex: 0,
    //         status: UNIFIED_STATUS.EXECUTING,
    //         reasoning:
    //             ((plan as Record<string, unknown>)?.reasoning as string) ||
    //             `Plan created for: ${input}`,
    //         createdAt: now,
    //         updatedAt: now,
    //         metadata: {
    //             startTime: now,
    //             createdBy: 'plan-execute-planner',
    //             thread: context.plannerMetadata.thread?.id,
    //             signals: (plan as Record<string, unknown>)?.signals,
    //         },
    //     };

    //     const rawSignals = (plan as Record<string, unknown>)?.signals as
    //         | {
    //               needs?: unknown;
    //               noDiscoveryPath?: unknown;
    //               errors?: unknown;
    //               suggestedNextStep?: unknown;
    //           }
    //         | undefined;
    //     const needs: string[] = Array.isArray(rawSignals?.needs)
    //         ? (rawSignals!.needs as unknown[])
    //               .filter((x) => typeof x === 'string')
    //               .map((x) => String(x))
    //         : [];
    //     const noDiscoveryPath: string[] | undefined = Array.isArray(
    //         rawSignals?.noDiscoveryPath,
    //     )
    //         ? (rawSignals!.noDiscoveryPath as unknown[])
    //               .filter((x) => typeof x === 'string')
    //               .map((x) => String(x))
    //         : undefined;
    //     const errorsFromSignals: string[] | undefined = Array.isArray(
    //         rawSignals?.errors,
    //     )
    //         ? (rawSignals!.errors as unknown[])
    //               .filter((x) => typeof x === 'string')
    //               .map((x) => String(x))
    //         : undefined;
    //     const suggestedNextStep: string | undefined =
    //         typeof rawSignals?.suggestedNextStep === 'string'
    //             ? (rawSignals!.suggestedNextStep as string)
    //             : undefined;
    //     if (noDiscoveryPath && newPlan.metadata) {
    //         (newPlan.metadata as Record<string, unknown>).noDiscoveryPath =
    //             noDiscoveryPath;
    //     }
    //     if (errorsFromSignals && newPlan.metadata) {
    //         (newPlan.metadata as Record<string, unknown>).errors =
    //             errorsFromSignals;
    //     }
    //     if (suggestedNextStep && newPlan.metadata) {
    //         (newPlan.metadata as Record<string, unknown>).suggestedNextStep =
    //             suggestedNextStep;
    //     }

    //     if (needs.length > 0) {
    //         const currentPlan = this.getCurrentPlan(context);
    //         const prevReplans = Number(
    //             (currentPlan?.metadata as Record<string, unknown> | undefined)
    //                 ?.replansCount ?? 0,
    //         );

    //         const maxReplans = this.replanPolicy.maxReplans;
    //         if (!maxReplans || prevReplans < maxReplans) {
    //             newPlan.status = UNIFIED_STATUS.REPLANNING;
    //             (newPlan.metadata as Record<string, unknown>) = {
    //                 ...(newPlan.metadata || {}),
    //                 replanCause: 'missing_inputs',
    //                 replansCount: prevReplans + 1,
    //             };

    //             this.logger.info(
    //                 'Plan marked for replanning due to missing inputs',
    //                 {
    //                     planId: newPlan.id,
    //                     needs,
    //                     replansCount: prevReplans + 1,
    //                     maxReplans: maxReplans,
    //                 },
    //             );
    //         } else {
    //             newPlan.status = UNIFIED_STATUS.FAILED;
    //             (newPlan.metadata as Record<string, unknown>) = {
    //                 ...(newPlan.metadata || {}),
    //                 replanCause: 'max_replans_exceeded',
    //                 replansCount: prevReplans,
    //             };

    //             this.logger.warn(
    //                 'Max replans exceeded - stopping replan loop',
    //                 {
    //                     planId: newPlan.id,
    //                     needs,
    //                     replansCount: prevReplans,
    //                     maxReplans: maxReplans,
    //                 },
    //             );
    //         }
    //     }

    //     const previousPlan = this.getCurrentPlan(context);
    //     this.setCurrentPlan(context, newPlan);

    //     if (
    //         previousPlan?.status === UNIFIED_STATUS.REPLANNING &&
    //         context.agentContext
    //     ) {
    //         try {
    //             const elapsed = previousPlan.metadata?.startTime
    //                 ? Date.now() - (previousPlan.metadata.startTime as number)
    //                 : undefined;
    //             const replansCount = (
    //                 previousPlan.metadata as Record<string, unknown> | undefined
    //             )?.replansCount;
    //             const observability = getObservability();
    //             void observability.telemetry.traceEvent(
    //                 createTelemetryEvent('planner.replan.completed', {
    //                     previousPlanId: previousPlan.id,
    //                     newPlanId: newPlan.id,
    //                     replansCount,
    //                     elapsedMs: elapsed,
    //                     cause: (
    //                         previousPlan.metadata as
    //                             | Record<string, unknown>
    //                             | undefined
    //                     )?.replanCause,
    //                     sessionId: context.agentContext.sessionId,
    //                     agentName: context.agentContext.agentName,
    //                     correlationId: context.agentContext.correlationId,
    //                 }),
    //                 async () => {
    //                     return {};
    //                 },
    //             );
    //         } catch {}
    //     }

    //     if (context) {
    //         const observability = getObservability();
    //         void observability.telemetry.traceEvent(
    //             createTelemetryEvent('plan_created', {
    //                 goal: input,
    //                 stepsCount: newPlan.steps.length,
    //                 planId: newPlan.id,
    //                 strategy: newPlan.strategy,
    //                 signals: newPlan.metadata?.signals,
    //                 needs: needs,
    //                 noDiscoveryPath,
    //                 errors: errorsFromSignals,
    //                 suggestedNextStep,
    //                 sessionId: context.agentContext?.sessionId,
    //                 agentName: context.agentContext?.agentName,
    //                 correlationId: context.agentContext?.correlationId,
    //             }),
    //             async () => {
    //                 return {};
    //             },
    //         );
    //     }

    //     if (
    //         newPlan.status === UNIFIED_STATUS.FAILED &&
    //         (newPlan.metadata as Record<string, unknown>)?.replanCause ===
    //             'max_replans_exceeded'
    //     ) {
    //         const maxReplans = this.replanPolicy.maxReplans;
    //         return {
    //             id: newPlan.id,
    //             goal: newPlan.goal,
    //             strategy: PlanningStrategy.PLAN_EXECUTE,
    //             steps: newPlan.steps,
    //             context: {},
    //             createdAt: newPlan.createdAt,
    //             agentName: context.agentContext?.agentName || 'unknown',
    //             status: 'failed',
    //             reasoning:
    //                 'Max replans exceeded - cannot create valid plan due to missing inputs',
    //             action: {
    //                 type: 'final_answer',
    //                 content:
    //                     'I cannot complete this task because I need more information. Please provide the missing details or rephrase your request.',
    //             },
    //             metadata: {
    //                 planId: newPlan.id,
    //                 totalSteps: newPlan.steps.length,
    //                 replansCount: (newPlan.metadata as Record<string, unknown>)
    //                     ?.replansCount,
    //                 maxReplans: maxReplans,
    //                 needs: needs,
    //             },
    //         };
    //     }

    //     return {
    //         id: newPlan.id,
    //         goal: newPlan.goal,
    //         strategy: PlanningStrategy.REWOO,
    //         steps: newPlan.steps,
    //         context: {},
    //         createdAt: newPlan.createdAt,
    //         agentName: context.agentContext?.agentName || 'unknown',
    //         status: 'created',
    //         reasoning: 'Plan created. Ready to execute.',
    //         action: {
    //             type: 'execute_plan' as const,
    //             planId: newPlan.id,
    //         } as AgentAction,
    //         metadata: {
    //             planId: newPlan.id,
    //             totalSteps: newPlan.steps.length,
    //         },
    //     };
    // }

    private getAvailableToolsFormatted(
        context: StrategyExecutionContext,
    ): Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
    }> {
        if (!context.agentContext?.allTools) {
            return [];
        }

        return context.agentContext.allTools.map((tool) => ({
            name: tool.name,
            description: tool.description || `Tool: ${tool.name}`,
            parameters: tool.inputJsonSchema?.parameters || {
                type: 'object',
                properties: {},
                required: [],
            },
            outputSchema: tool.outputJsonSchema?.parameters || {
                type: 'object',
                properties: {},
                required: [],
            },
        }));
    }

    /**
     * Executa steps do plano
     */
    // private async executePlanSteps(
    //     plan: ExecutionPlan,
    //     context: StrategyExecutionContext,
    //     startTime: number,
    // ): Promise<{ steps: ExecutionStep[]; toolCallsCount: number }> {
    //     const executedSteps: ExecutionStep[] = [];
    //     let toolCallsCount = 0;

    //     for (let i = 0; i < plan.steps.length; i++) {
    //         if (this.shouldStopExecution(i, toolCallsCount, startTime)) {
    //             break;
    //         }

    //         const currentStep = plan.steps[i];
    //         if (!currentStep) {
    //             break;
    //         }

    //         const stepResult = await this.executePlanStep(
    //             currentStep,
    //             context,
    //             i,
    //         );
    //         executedSteps.push(stepResult);

    //         if (
    //             stepResult.metadata?.toolCalls &&
    //             Array.isArray(stepResult.metadata.toolCalls)
    //         ) {
    //             toolCallsCount += stepResult.metadata.toolCalls.length;
    //         }
    //     }

    //     return { steps: executedSteps, toolCallsCount };
    // }

    /**
     * Executa um step individual
     */
    // private async executePlanStep(
    //     planStep: PlanStep,
    //     context: StrategyExecutionContext,
    //     stepIndex: number,
    // ): Promise<ExecutionStep> {
    //     const stepStartTime = Date.now();

    //     const step: ExecutionStep = {
    //         id: `rewoo-execute-${stepIndex}-${Date.now()}`,
    //         type: 'execute',
    //         timestamp: stepStartTime,
    //         duration: 0,
    //         metadata: {
    //             planStep,
    //             stepIndex,
    //             strategy: 'rewoo',
    //         },
    //     };

    //     try {
    //         const result = await this.executeStepAction(planStep, context);
    //         step.result = result;
    //         if (step.metadata) {
    //             step.metadata.success = true;
    //         }
    //     } catch (error) {
    //         if (step.metadata) {
    //             step.metadata.success = false;
    //             step.metadata.error =
    //                 error instanceof Error ? error.message : String(error);
    //         }
    //     }

    //     step.duration = Date.now() - stepStartTime;
    //     return step;
    // }

    /**
     * Executa ação baseada no tipo do step
     */
    // private async executeStepAction(
    //     planStep: PlanStep,
    //     context: StrategyExecutionContext,
    // ): Promise<any> {
    //     switch (planStep.type) {
    //         case 'tool_call':
    //             return await this.executeToolStep(planStep, context);
    //         case 'llm_call':
    //             return await this.executeLLMStep(planStep, context);
    //         default:
    //             throw new Error(`Unknown step type: ${planStep.type}`);
    //     }
    // }

    // /**
    //  * Executa step de tool call
    //  */
    // private async executeToolStep(
    //     planStep: PlanStep,
    //     context: StrategyExecutionContext,
    // ): Promise<any> {
    //     if (!planStep.toolName || !planStep.input) {
    //         throw new Error('Tool step missing required parameters');
    //     }

    //     const tool = context.tools.find((t) => t.name === planStep.toolName);
    //     if (!tool) {
    //         throw new Error(`Tool not found: ${planStep.toolName}`);
    //     }

    //     // Simulação - em produção seria chamada real para a ferramenta
    //     return {
    //         type: 'tool_result',
    //         content: `Executed ${tool.name} with input: ${JSON.stringify(planStep.input)}`,
    //         metadata: {
    //             toolName: planStep.toolName,
    //             arguments: planStep.input,
    //             executionTime: Date.now(),
    //         },
    //     };
    // }

    // /**
    //  * Executa step de LLM call
    //  */
    // private async executeLLMStep(
    //     planStep: PlanStep,
    //     _context: StrategyExecutionContext,
    // ): Promise<any> {
    //     if (!planStep.prompt) {
    //         throw new Error('LLM step missing prompt');
    //     }

    //     // Simulação - em produção seria chamada real para LLM
    //     return {
    //         type: 'llm_result',
    //         content: `LLM response for: ${planStep.prompt.substring(0, 50)}...`,
    //         metadata: {
    //             prompt: planStep.prompt,
    //             executionTime: Date.now(),
    //         },
    //     };
    // }

    // /**
    //  * Sintetiza resultados finais
    //  */
    // private async synthesizeResults(
    //     steps: ExecutionStep[],
    //     context: StrategyExecutionContext,
    // ): Promise<any> {
    //     const synthesisPrompt = this.buildSynthesisPrompt(steps, context);
    //     const synthesisResponse = await this.callSynthesisLLM(synthesisPrompt);

    //     return {
    //         output: synthesisResponse.output,
    //         quality: 0.8,
    //         reasoning: synthesisResponse.reasoning,
    //     };
    // }

    // /**
    //  * Verifica se deve parar execução
    //  */
    // private shouldStopExecution(
    //     currentStepIndex: number,
    //     toolCallsCount: number,
    //     startTime: number,
    // ): boolean {
    //     const executionTime = Date.now() - startTime;

    //     if (currentStepIndex >= this.config.maxExecutionSteps) return true;
    //     if (toolCallsCount >= this.config.maxToolCalls) return true;
    //     if (executionTime >= this.config.maxExecutionTime) return true;

    //     return false;
    // }

    /**
     * Cria step de plano
     */
    //     private createPlanStep(plan: ExecutionPlan): ExecutionStep {
    //         return {
    //             id: `rewoo-plan-${Date.now()}`,
    //             type: 'plan',
    //             timestamp: Date.now(),
    //             duration: 0,
    //             metadata: {
    //                 plan,
    //                 strategy: 'rewoo',
    //                 planningPhase: 'complete',
    //             },
    //         };
    //     }

    //     /**
    //      * Valida plano criado
    //      */
    //     private validatePlan(
    //         plan: ExecutionPlan,
    //         context: StrategyExecutionContext,
    //     ): void {
    //         if (!plan.steps || plan.steps.length === 0) {
    //             throw new Error('Plan must have at least one step');
    //         }

    //         if (plan.steps.length > this.config.maxPlanningSteps) {
    //             throw new Error(
    //                 `Plan exceeds maximum steps: ${plan.steps.length} > ${this.config.maxPlanningSteps}`,
    //             );
    //         }

    //         const requiredTools = plan.steps
    //             .filter((s) => s.type === 'tool_call')
    //             .map((s) => s.toolName);

    //         for (const toolName of requiredTools) {
    //             if (!context.tools.find((t) => t.name === toolName)) {
    //                 throw new Error(`Required tool not available: ${toolName}`);
    //             }
    //         }
    //     }

    //     /**
    //      * Faz parse dos steps do plano
    //      */
    //     private parsePlanSteps(
    //         stepsData: any[],
    //         _context: StrategyExecutionContext,
    //     ): PlanStep[] {
    //         return stepsData.map((stepData, index) => ({
    //             id: stepData.id || `step-${index}`,
    //             name: stepData.name || `Step ${index + 1}`,
    //             type: stepData.type || 'llm_call',
    //             toolName: stepData.toolName,
    //             input: stepData.input,
    //             prompt: stepData.prompt,
    //             dependencies: stepData.dependencies || [],
    //         }));
    //     }

    //     /**
    //      * Constrói prompt de síntese
    //      */
    //     private buildSynthesisPrompt(
    //         steps: ExecutionStep[],
    //         context: StrategyExecutionContext,
    //     ): string {
    //         const executedStepsSummary = steps
    //             .filter((s) => s.type === 'execute')
    //             .map((step, index) => {
    //                 const planStep = step.metadata?.planStep as
    //                     | PlanStep
    //                     | undefined;
    //                 const stepName = planStep?.name || `Step ${index + 1}`;
    //                 const success = step.metadata?.success !== false;
    //                 return `- ${stepName}: ${success ? '✅' : '❌'}`;
    //             })
    //             .join('\n');

    //         return `
    // Você é um sintetizador para estratégia ReWoo.

    // TAREFA ORIGINAL: ${context.input}

    // STEPS EXECUTADOS:
    // ${executedStepsSummary}

    // INSTRUÇÕES:
    // Sintetize os resultados em uma resposta coerente e útil.

    // FORMATO DA RESPOSTA:
    // Reasoning: [análise dos resultados]
    // Output: [resposta final]
    //         `.trim();
    //     }

    //     /**
    //      * Constrói resultado de sucesso
    //      */
    //     private buildSuccessResult(
    //         synthesisResult: any,
    //         steps: ExecutionStep[],
    //         startTime: number,
    //         toolCallsCount: number,
    //     ): ExecutionResult {
    //         const executionTime = Date.now() - startTime;

    //         this.logger.info('🎯 ReWoo execution completed successfully', {
    //             steps: steps.length,
    //             executionTime,
    //             toolCalls: toolCallsCount,
    //         });

    //         return {
    //             output: synthesisResult.output,
    //             strategy: 'rewoo',
    //             complexity: steps.length,
    //             executionTime,
    //             steps,
    //             success: true,
    //             metadata: {
    //                 toolCallsCount,
    //                 synthesisQuality: synthesisResult.quality,
    //             },
    //         };
    //     }

    //     /**
    //      * Constrói resultado de erro
    //      */
    //     private buildErrorResult(
    //         error: unknown,
    //         steps: ExecutionStep[],
    //         startTime: number,
    //         toolCallsCount: number,
    //     ): ExecutionResult {
    //         const errorMessage =
    //             error instanceof Error ? error.message : 'Unknown error';
    //         const executionTime = Date.now() - startTime;

    //         this.logger.error(
    //             '❌ ReWoo execution failed',
    //             error instanceof Error ? error : undefined,
    //             {
    //                 stepsCompleted: steps.length,
    //                 toolCalls: toolCallsCount,
    //                 executionTime,
    //             },
    //         );

    //         return {
    //             output: null,
    //             strategy: 'rewoo',
    //             complexity: steps.length,
    //             executionTime,
    //             steps,
    //             success: false,
    //             error: errorMessage,
    //             metadata: {
    //                 toolCallsCount,
    //                 failureReason: errorMessage,
    //             },
    //         };
    //     }
}
