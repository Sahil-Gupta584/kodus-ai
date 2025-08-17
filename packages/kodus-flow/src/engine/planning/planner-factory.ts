/**
 * Planner Factory - Cria planners REAIS com LLM obrigatório
 *
 * SEM LLM = SEM AGENT = ERRO!
 */

import { createLogger } from '../../observability/index.js';
import type { LLMAdapter } from '../../adapters/llm/index.js';
import { PlanAndExecutePlanner } from './strategies/plan-execute-planner.js';
import type { ReplanPolicyConfig } from './strategies/plan-execute-planner.js';
import { Thread } from '../../core/types/common-types.js';
import { AgentIdentity } from '@/core/types/agent-definition.js';

// Import comprehensive action types from agent-types
import type {
    AgentAction as CoreAgentAction,
    AgentActionType as CoreAgentActionType,
    FinalAnswerAction as CoreFinalAnswerAction,
    ToolCallAction as CoreToolCallAction,
    ParallelToolsAction,
    SequentialToolsAction,
    ConditionalToolsAction,
    MixedToolsAction,
    DependencyToolsAction,
    NeedMoreInfoAction,
    DelegateToAgentAction,
} from '../../core/types/agent-types.js';

// Import type guards from agent-types for consistency
import {
    isToolCallAction as coreIsToolCallAction,
    isFinalAnswerAction as coreIsFinalAnswerAction,
    isParallelToolsAction,
    isSequentialToolsAction,
    isConditionalToolsAction,
    isMixedToolsAction,
    isDependencyToolsAction,
} from '../../core/types/agent-types.js';

export type PlannerType = 'react' | 'tot' | 'reflexion' | 'plan-execute';

export interface Planner<
    TContext extends PlannerExecutionContext = PlannerExecutionContext,
> {
    think(context: TContext): Promise<AgentThought>;
    analyzeResult(
        result: ActionResult,
        context: TContext,
    ): Promise<ResultAnalysis>;
    // Optional hooks for Plan–Execute style planners
    getPlanForContext?(context: TContext): unknown | null;
    resolveArgs?(
        args: Record<string, unknown>,
        steps: unknown[],
        context?: TContext,
    ): Promise<{ args: Record<string, unknown>; missing: string[] }>;
}

// Specific metadata types for better type safety
export interface AgentThoughtMetadata {
    plannerType?: PlannerType;
    executionTime?: number;
    retryCount?: number;
    [key: string]: unknown;
}

export interface AgentThought {
    reasoning: string;
    action: AgentAction; // Make action required to fix compatibility
    metadata?: AgentThoughtMetadata;
}

// Re-export core action types for planner compatibility
export type AgentAction = CoreAgentAction;
export type AgentActionType = CoreAgentActionType;

// Re-export specific action interfaces
export type FinalAnswerAction = CoreFinalAnswerAction;
export type ToolCallAction = CoreToolCallAction;
export type {
    ParallelToolsAction,
    SequentialToolsAction,
    ConditionalToolsAction,
    MixedToolsAction,
    DependencyToolsAction,
    NeedMoreInfoAction,
    DelegateToAgentAction,
};

// Specific metadata types for action results
export interface ActionResultMetadata {
    executionTime?: number;
    toolName?: string;
    success?: boolean;
    retryCount?: number;
    errorCode?: string;
    [key: string]: unknown;
}

export type ActionResult =
    | ToolResult
    | FinalAnswerResult
    | ErrorResult
    | ToolResultsArray
    | NeedsReplanResult;

// Tool results array for multiple tool execution
export interface ToolResultsArray {
    type: 'tool_results';
    content: Array<{
        toolName: string;
        result?: unknown;
        error?: string;
    }>;
    metadata?: ActionResultMetadata;
}

export interface ToolResult {
    type: 'tool_result';
    content: unknown;
    metadata?: ActionResultMetadata;
}

export interface FinalAnswerResult {
    type: 'final_answer';
    content: string;
    metadata?: ActionResultMetadata;
}

export interface ErrorResult {
    type: 'error';
    error: string;
    metadata?: ActionResultMetadata;
    status?: string;
    replanContext?: import('../../core/types/planning-shared.js').PlanExecutionResult['replanContext'];
    feedback?: string;
}

export interface NeedsReplanResult {
    type: 'needs_replan';
    replanContext?: import('../../core/types/planning-shared.js').PlanExecutionResult['replanContext'];
    feedback: string;
    metadata?: ActionResultMetadata;
}

export type ResultAnalysis = {
    isComplete: boolean;
    isSuccessful: boolean;
    feedback: string;
    shouldContinue: boolean;
    suggestedNextAction?: string;
};

/**
 * ✅ UNIFIED: StepExecution now uses the implementation from step-execution.ts
 * This ensures consistency between planner and AI SDK components
 */
export type StepExecution =
    import('../../core/context/step-execution.js').AgentStepResult;

/**
 * ✅ REMOVED: StepExecutionMetadata is no longer needed
 * Metadata is now handled by AgentStepResult from step-execution.ts
 */

// Specific metadata types for execution context
export interface ExecutionContextMetadata {
    agentName?: string;
    correlationId?: string;
    tenantId?: string;
    thread?: Thread; // ⭐ NOVO: ID da thread para acesso ao ExecutionRuntime
    startTime?: number;
    plannerType?: PlannerType;
    // Replan cause for observability
    replanCause?:
        | 'fail_window'
        | 'ttl'
        | 'budget'
        | 'tool_missing'
        | 'missing_inputs';
    // 🆕 NEW: Context quality metrics from auto-retrieval
    contextMetrics?: {
        memoryRelevance: number;
        sessionContinuity: number;
        executionHealth: number;
    };
    [key: string]: unknown;
}

// Enhanced tool information with usage analytics and context engineering
export interface EnhancedToolInfo {
    name: string;
    description: string;
    schema: unknown;

    // Usage analytics
    usageCount?: number; // How many times this tool was used
    lastSuccess?: boolean; // Was the last execution successful?
    avgResponseTime?: number; // Average execution time in ms
    errorRate?: number; // Percentage of failed executions
    lastUsed?: number; // Timestamp of last usage

    // Context engineering metadata
    examples?: Array<{
        description: string;
        input: Record<string, unknown>;
        expectedOutput?: unknown;
        context?: string;
        tags?: string[];
    }>;

    plannerHints?: {
        useWhen?: string[];
        avoidWhen?: string[];
        combinesWith?: string[];
        conflictsWith?: string[];
    };

    categories?: string[];
    dependencies?: string[];
}

// Learning context from previous executions
export interface LearningContext {
    commonMistakes: string[]; // Patterns of errors to avoid
    successPatterns: string[]; // What works well for this agent
    userFeedback: string[]; // User feedback on agent performance
    preferredTools: string[]; // Tools that work best for this agent
}

// Execution hints for better LLM performance
export interface ExecutionHints {
    lastSuccessfulAction?: string; // Description of the last successful action
    currentGoal?: string; // What the agent is trying to achieve now
    timeConstraint?: number; // Time limit in seconds
    userUrgency?: 'low' | 'medium' | 'high'; // How urgent this task is
    environmentState?: Record<string, unknown>; // Current state of the world
    userPreferences?: {
        // How the user likes things done
        verbosity?: 'concise' | 'detailed' | 'verbose';
        riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
        preferredStyle?: 'formal' | 'casual' | 'technical';
    };
    // 🆕 NEW: Auto-retrieved context from ContextBuilder
    relevantMemories?: string[];
    recentPatterns?: string[];
    suggestions?: string[];
    sessionContinuity?: string;
}

export interface ExecutionHistoryEntry {
    thought: AgentThought;
    action: AgentAction;
    result: ActionResult;
    observation: ResultAnalysis;
}

// Enhanced execution context for planners with improved LLM performance
export interface PlannerExecutionContext {
    input: string;
    history: StepExecution[];
    isComplete: boolean;

    iterations: number;
    maxIterations: number;
    plannerMetadata: ExecutionContextMetadata;

    // 🚀 NEW: Execution hints for better LLM decision making
    executionHints?: ExecutionHints;

    // ✅ NEW: ContextBuilder integration - AgentContext with clean APIs
    agentContext?: import('../../core/types/agent-types.js').AgentContext;

    // ✅ CORREÇÃO: Replan context for better planning
    replanContext?: import('../../core/types/planning-shared.js').PlanExecutionResult['replanContext'];

    // Methods
    update(
        thought: AgentThought,
        result: ActionResult,
        observation: ResultAnalysis,
    ): void;
    getCurrentSituation(): string;
    getFinalResult(): AgentExecutionResult;
}

// Enhanced context configuration for advanced execution features
export interface ContextEnhancementConfig {
    executionHints?: ExecutionHints;
    learningContext?: LearningContext;
    enhanceTools?: boolean; // Whether to enhance tool info with analytics
}

/**
 * Helper function to check if ActionResult is successful (not an error)
 */
export function isSuccessResult(result: ActionResult): boolean {
    return result.type !== 'error';
}

/**
 * Generate execution hints automatically from history and context
 */
export function generateExecutionHints(
    history: StepExecution[],
    agentIdentity?: AgentIdentity,
): ExecutionHints {
    const hints: ExecutionHints = {};

    // Find last successful action
    const lastSuccessfulEntry = [...history]
        .reverse()
        .find((entry) => isSuccessResult(entry.result));

    if (lastSuccessfulEntry) {
        hints.lastSuccessfulAction = `${lastSuccessfulEntry.action.type}: ${
            isToolCallAction(lastSuccessfulEntry.action)
                ? lastSuccessfulEntry.action.toolName
                : 'completed successfully'
        }`;
    }

    // Extract current goal from agent identity
    if (agentIdentity?.goal) {
        hints.currentGoal = agentIdentity.goal;
    }

    // Determine user urgency based on iteration count and constraints
    if (history.length > 5) {
        hints.userUrgency = 'high'; // Many iterations suggest urgency
    } else if (history.length > 2) {
        hints.userUrgency = 'medium';
    } else {
        hints.userUrgency = 'low';
    }

    // Set user preferences based on agent personality/style
    if (agentIdentity?.style || agentIdentity?.personality) {
        hints.userPreferences = {
            preferredStyle:
                agentIdentity.style === 'formal'
                    ? 'formal'
                    : agentIdentity.style === 'casual'
                      ? 'casual'
                      : 'technical',
            verbosity: agentIdentity.personality?.includes('concise')
                ? 'concise'
                : agentIdentity.personality?.includes('detailed')
                  ? 'detailed'
                  : 'verbose',
            riskTolerance: agentIdentity.personality?.includes('careful')
                ? 'conservative'
                : agentIdentity.personality?.includes('bold')
                  ? 'aggressive'
                  : 'moderate',
        };
    }

    return hints;
}

/**
 * Generate learning context from execution history
 */
export function generateLearningContext(
    history: StepExecution[],
): LearningContext {
    const context: LearningContext = {
        commonMistakes: [],
        successPatterns: [],
        userFeedback: [],
        preferredTools: [],
    };

    // Analyze errors for common mistakes
    const errorEntries = history.filter((entry) => isErrorResult(entry.result));
    const errorPatterns = errorEntries.map((entry) => {
        const action = entry.action;
        const errorResult = entry.result as ErrorResult;
        return `${action.type} failures: ${errorResult.error || 'unknown error'}`;
    });
    context.commonMistakes = [...new Set(errorPatterns)].slice(0, 5);

    // Analyze successes for patterns
    const successEntries = history.filter((entry) =>
        isSuccessResult(entry.result),
    );
    const successPatterns = successEntries.map((entry) => {
        const action = entry.action;
        return `${action.type} succeeded: ${entry.observation.feedback || 'completed successfully'}`;
    });
    context.successPatterns = [...new Set(successPatterns)].slice(0, 5);

    // Find preferred tools (most successful)
    const toolUsage = new Map<string, { total: number; successful: number }>();
    history.forEach((entry) => {
        if (entry.action.type === 'tool_call') {
            const toolName = (entry.action as ToolCallAction).toolName;
            const current = toolUsage.get(toolName) || {
                total: 0,
                successful: 0,
            };
            current.total++;
            if (isSuccessResult(entry.result)) current.successful++;
            toolUsage.set(toolName, current);
        }
    });

    context.preferredTools = Array.from(toolUsage.entries())
        .filter(([, stats]) => stats.successful / stats.total > 0.7) // 70% success rate
        .sort((a, b) => b[1].successful - a[1].successful)
        .map(([toolName]) => toolName)
        .slice(0, 5);

    return context;
}

/**
 * Create an enhanced execution context with automatic hints and learning
 */
// export function createEnhancedExecutionContext(
//     agentContext: AgentContext,
//     input: string,
//     history: ExecutionHistoryEntry[],
//     iterations: number,
//     maxIterations: number,
//     constraints?: string[],
//     plannerMetadata?: ExecutionContextMetadata,
// ): PlannerExecutionContext {
//     // Auto-generate execution hints and learning context
//     const autoHints = generateExecutionHints(
//         history,
//         agentContext.agentIdentity,
//     );
//     const autoLearning = generateLearningContext(history);

//     return createPlannerExecutionContext(
//         agentContext,
//         input,
//         history,
//         iterations,
//         maxIterations,
//         constraints,
//         plannerMetadata,
//         {
//             executionHints: autoHints,
//             learningContext: autoLearning,
//             enhanceTools: true, // Always enhance tools for better performance
//         },
//     );
// }

// Context adapter to convert AgentContext to PlannerExecutionContext
// export function createPlannerExecutionContext(
//     agentContext: AgentContext,
//     input: string,
//     history: ExecutionHistoryEntry[],
//     iterations: number,
//     maxIterations: number,
//     constraints?: string[],
//     plannerMetadata?: ExecutionContextMetadata,
//     enhancement?: ContextEnhancementConfig,
// ): PlannerExecutionContext {
//     // Convert basic tools to enhanced tools if requested
//     const enhancedTools: EnhancedToolInfo[] = (
//         agentContext.availableTools || []
//     ).map((tool) => {
//         // Extract analytics from tool usage history if available
//         const toolUsageFromHistory = history.filter(
//             (entry) =>
//                 entry.action.type === 'tool_call' &&
//                 (entry.action as ToolCallAction).toolName === tool.name,
//         );

//         const baseEnhancedTool: EnhancedToolInfo = {
//             name: tool.name,
//             description: tool.description,
//             schema: tool.inputSchema,
//             examples: tool.examples as EnhancedToolInfo['examples'],
//             plannerHints: tool.plannerHints as EnhancedToolInfo['plannerHints'],
//             categories: tool.categories,
//             dependencies: tool.dependencies,
//         };

//         if (enhancement?.enhanceTools) {
//             // Add usage analytics
//             return {
//                 ...baseEnhancedTool,
//                 usageCount: toolUsageFromHistory.length,
//                 lastSuccess:
//                     toolUsageFromHistory.length > 0
//                         ? isSuccessResult(
//                               toolUsageFromHistory[
//                                   toolUsageFromHistory.length - 1
//                               ]!.result,
//                           )
//                         : undefined,
//                 errorRate:
//                     toolUsageFromHistory.length > 0
//                         ? toolUsageFromHistory.filter((entry) =>
//                               isErrorResult(entry.result),
//                           ).length / toolUsageFromHistory.length
//                         : undefined,
//                 lastUsed:
//                     toolUsageFromHistory.length > 0
//                         ? Date.now() // Would be better to get from actual execution timestamp
//                         : undefined,
//             };
//         }

//         return baseEnhancedTool;
//     });

//     return {
//         history,
//         iterations,
//         maxIterations,
//         constraints,
//         plannerMetadata: plannerMetadata || {},

//         // 🚀 Enhanced execution context
//         executionHints: enhancement?.executionHints,
//         learningContext: enhancement?.learningContext,

//         update(
//             thought: AgentThought,
//             result: ActionResult,
//             observation: ResultAnalysis,
//         ): void {
//             history.push({
//                 thought,
//                 action: thought.action,
//                 result,
//                 observation,
//             });
//         },

//         getCurrentSituation(): string {
//             const recentHistory = history.slice(-3);
//             return recentHistory
//                 .map(
//                     (entry) =>
//                         `Action: ${JSON.stringify(entry.action)} -> Result: ${JSON.stringify(entry.result)}`,
//                 )
//                 .join('\n');
//         },

//         get isComplete(): boolean {
//             return (
//                 history.length > 0 &&
//                 history[history.length - 1]?.observation.isComplete === true
//             );
//         },

//         getFinalResult(): AgentExecutionResult {
//             const lastEntry = history[history.length - 1];
//             return {
//                 success: lastEntry?.observation.isComplete || false,
//                 result: lastEntry?.result,
//                 iterations,
//                 totalTime: Date.now(), // Simplified
//                 thoughts: history.map((h) => h.thought),
//                 metadata: {
//                     plannerType: plannerMetadata?.plannerType,
//                     toolCallsCount: history.filter(
//                         (h) => h.action.type === 'tool_call',
//                     ).length,
//                     errorsCount: history.filter(
//                         (h) => h.result.type === 'error',
//                     ).length,
//                 },
//             };
//         },
//     };
// }

// Specific metadata types for execution results
export interface ExecutionResultMetadata {
    plannerType?: PlannerType;
    toolCallsCount?: number;
    errorsCount?: number;
    averageConfidence?: number;
    finalConfidence?: number;
    actionBreakdown?: Record<string, number>;
    [key: string]: unknown;
}

export interface AgentExecutionResult {
    success: boolean;
    result?: unknown;
    error?: string;
    iterations: number;
    totalTime: number;
    thoughts: AgentThought[];
    metadata?: ExecutionResultMetadata;
}

// Re-export type guards for planner compatibility
export const isToolCallAction = coreIsToolCallAction;
export const isFinalAnswerAction = coreIsFinalAnswerAction;
export {
    isParallelToolsAction,
    isSequentialToolsAction,
    isConditionalToolsAction,
    isMixedToolsAction,
    isDependencyToolsAction,
};

export function isToolResult(result: ActionResult): result is ToolResult {
    return result.type === 'tool_result';
}

export function isFinalAnswerResult(
    result: ActionResult,
): result is FinalAnswerResult {
    return result.type === 'final_answer';
}

export function isErrorResult(result: ActionResult): result is ErrorResult {
    return result.type === 'error';
}

export function isNeedsReplanResult(
    result: ActionResult,
): result is NeedsReplanResult {
    return result.type === 'needs_replan';
}

export function isToolResultsArray(
    result: ActionResult,
): result is ToolResultsArray {
    return result.type === 'tool_results';
}

// ===== ACTION BUILDERS =====

/**
 * Create a proper ToolCallAction
 */
export function createToolCallAction(
    toolName: string,
    input: unknown,
    reasoning?: string,
): ToolCallAction {
    return {
        type: 'tool_call',
        toolName,
        input,
        reasoning,
    };
}

/**
 * Create a proper FinalAnswerAction
 */
export function createFinalAnswerAction(content: string): FinalAnswerAction {
    return {
        type: 'final_answer',
        content,
    };
}

// Helper function to get error from any result type
export function getResultError(result: ActionResult): string | undefined {
    if (isErrorResult(result)) {
        return result.error;
    }
    return undefined;
}

// Helper function to get content from any result type
export function getResultContent(result: ActionResult): unknown {
    if (isToolResult(result)) {
        return result.content;
    }
    if (isFinalAnswerResult(result)) {
        return result.content;
    }
    if (isToolResultsArray(result)) {
        return result.content;
    }
    return undefined;
}

export class PlannerFactory {
    private static logger = createLogger('planner-factory');

    /**
     * Cria planner COM LLM obrigatório
     * SEM LLM = ERRO IMEDIATO!
     */
    static create<T extends PlannerType>(
        type: T,
        llmAdapter: LLMAdapter,
        options?: { replanPolicy?: Partial<ReplanPolicyConfig> },
    ): Planner {
        if (!llmAdapter) {
            throw new Error(`
🚨 PLANNER '${type}' REQUIRES LLM!

An Agent without LLM is just a script pretending to be smart.
- If you want a script → write a script
- If you want an Agent → provide an LLM

Available LLM adapters: LLMAdapter with Gemini, OpenAI, etc.
            `);
        }

        this.logger.info('Creating planner', {
            type,
            llmProviderName: llmAdapter.getProvider?.()?.name || 'unknown',
            availableTechniques: llmAdapter.getAvailableTechniques?.() || [],
        });

        switch (type) {
            case 'plan-execute':
                return new PlanAndExecutePlanner(
                    llmAdapter,
                    undefined, // promptConfig
                    options?.replanPolicy, // ✅ CENTRALIZED: Pass replan policy directly
                );

            default:
                throw new Error(`
Unknown planner type: '${type}'

Available planners:
- 'react': ReAct (Reasoning + Acting) - Most popular
- 'tot': Tree of Thoughts - Explores multiple paths
- 'reflexion': Self-reflection and learning from mistakes
- 'plan-execute': Creates full plan first, then executes

All planners require LLM to function.
                `);
        }
    }

    /**
     * Lista planners disponíveis
     */
    static getAvailablePlanners(): Array<{
        type: PlannerType;
        name: string;
        description: string;
        requiresLLM: boolean;
    }> {
        return [
            {
                type: 'react',
                name: 'ReAct',
                description:
                    'Reasoning + Acting in iterative cycles. Most popular and effective.',
                requiresLLM: true,
            },
            {
                type: 'tot',
                name: 'Tree of Thoughts',
                description:
                    'Explores multiple reasoning paths and selects best approach.',
                requiresLLM: true,
            },
            {
                type: 'reflexion',
                name: 'Reflexion',
                description:
                    'Self-reflection and learning from previous mistakes.',
                requiresLLM: true,
            },
            {
                type: 'plan-execute',
                name: 'Plan and Execute',
                description:
                    'Creates complete plan first, then executes step by step.',
                requiresLLM: true,
            },
        ];
    }

    /**
     * Valida se planner é compatível com LLM
     */
    static validateCompatibility(
        type: PlannerType,
        llmAdapter: LLMAdapter,
    ): boolean {
        const availableTechniques = llmAdapter.getAvailableTechniques?.() || [];

        switch (type) {
            case 'react':
                return availableTechniques.includes('react');
            case 'tot':
                return availableTechniques.includes('tot');
            default:
                return availableTechniques.includes('cot'); // Basic requirement
        }
    }
}
