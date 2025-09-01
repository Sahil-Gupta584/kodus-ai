/**
 * 🎯 STRATEGY UTILS
 *
 * Utilitários avançados para estratégias de execução.
 * Código funcional seguindo melhores práticas TypeScript.
 */

import { createLogger } from '../../../observability/index.js';
import { AgentContext } from '../../../core/types/allTypes.js';
import { StrategyFormatters } from './strategy-formatters.js';

interface Tool {
    name: string;
    description?: string;
    parameters?: {
        type: string;
        properties?: Record<string, any>;
        required?: string[];
    };
}

type Logger = ReturnType<typeof createLogger>;

/**
 * Sistema de composição de prompts por estratégia
 */
export class StrategyPromptComposer {
    private readonly formatters: StrategyFormatters;

    constructor(formatters?: StrategyFormatters) {
        this.formatters = formatters || new StrategyFormatters();
    }

    /**
     * Compõe prompt completo para ReAct Strategy
     */
    composeReActPrompt(context: {
        input: string;
        tools: any[];
        agentContext: AgentContext;
        history?: Array<{
            type: string;
            thought?: { reasoning: string; action: any };
            action?: any;
            result?: any;
        }>;
        additionalContext?: Record<string, unknown>;
    }): string {
        const sections: string[] = [];

        sections.push(this.getReActSystemPrompt());
        sections.push(this.composeReActTaskContext(context));

        if (context.tools.length > 0) {
            sections.push(this.formatters.formatToolsList(context.tools));
        }

        if (context.additionalContext) {
            sections.push(
                this.formatters.formatAdditionalContext(
                    context.additionalContext,
                ),
            );
        }

        if (context.history && context.history.length > 0) {
            sections.push(this.composeExecutionHistory(context.history));
        }

        sections.push(this.getReActInstructions());

        return sections.join('\n\n');
    }

    /**
     * Compõe prompt completo para ReWoo Strategy
     */
    composeReWooPrompt(context: {
        input: string;
        tools: Tool[];
        agentContext: AgentContext;
        additionalContext?: Record<string, unknown>;
        replanContext?: Record<string, unknown>;
    }): string {
        const sections: string[] = [];

        sections.push(this.getReWooSystemPrompt());
        sections.push(this.composeReWooTaskContext(context));

        if (context.tools.length > 0) {
            sections.push(this.formatters.formatToolsList(context.tools));
        }

        if (context.additionalContext) {
            sections.push(
                this.formatters.formatAdditionalContext(
                    context.additionalContext,
                ),
            );
        }

        if (context.replanContext) {
            sections.push(
                this.formatters.formatReplanContext(context.replanContext),
            );
        }

        sections.push(this.getReWooInstructions());

        return sections.join('\n\n');
    }

    private getReActSystemPrompt(): string {
        return `You are an intelligent agent that uses the ReAct (Reasoning + Acting) pattern.

Your process must be:
1. OBSERVE the current context and user input
2. THINK about the best action to take
3. ACT by executing the chosen action
4. OBSERVE the result of the action
5. REPEAT the cycle until achieving the goal

IMPORTANT RULES:
- Be concise but complete in your reasoning
- Always explain your thought process before acting
- Use tools only when necessary
- Stop when achieving the goal or final answer
- Admit when you don't know something

RESPONSE FORMAT:
Thought: [Your analysis and reasoning]
Action: [Tool name or "final_answer"]
Parameters: [JSON object if tool_call]`;
    }

    private getReWooSystemPrompt(): string {
        return `You are a ReWoo (Reasoning Without Observation) system that creates structured plans.

Your task is to DECOMPOSE complex problems into independent subtasks.

PROCESS:
1. ANALYZE the overall goal
2. DECOMPOSE into independent subtasks
3. IDENTIFY tools needed for each subtask
4. DEFINE parameters and dependencies
5. CREATE structured plan

IMPORTANT: Focus only on PLANNING, not execution!`;
    }

    private composeReActTaskContext(context: {
        input: string;
        agentContext: AgentContext;
    }): string {
        const sections: string[] = ['## 🎯 TASK CONTEXT'];

        sections.push(`**Objective:** ${context.input}`);
        sections.push(this.formatters.formatAgentContext(context.agentContext));

        return sections.join('\n');
    }

    private composeReWooTaskContext(context: {
        input: string;
        agentContext: AgentContext;
    }): string {
        const sections: string[] = ['## 🎯 PLANNING TASK'];

        sections.push(`**Goal:** ${context.input}`);
        sections.push(this.formatters.formatAgentContext(context.agentContext));

        return sections.join('\n');
    }

    private composeExecutionHistory(
        history: Array<{
            type: string;
            thought?: { reasoning: string; action: any };
            action?: any;
            result?: any;
        }>,
    ): string {
        const sections: string[] = ['## 📋 EXECUTION HISTORY'];

        history.forEach((step, index) => {
            sections.push(`**Step ${index + 1}:** ${step.type.toUpperCase()}`);

            if (step.thought) {
                sections.push(`- **Thought:** ${step.thought.reasoning}`);
                if (step.thought.action) {
                    sections.push(
                        `- **Action:** ${step.thought.action.type || 'Unknown'}`,
                    );
                }
            }

            if (step.action) {
                sections.push(`- **Action:** ${step.action.type || 'Unknown'}`);
            }

            if (step.result) {
                const resultStr =
                    typeof step.result.content === 'string'
                        ? step.result.content
                        : JSON.stringify(step.result.content);
                sections.push(
                    `- **Result:** ${this.truncateText(resultStr, 200)}`,
                );
            }
        });

        return sections.join('\n');
    }

    private getReActInstructions(): string {
        return `## 📋 REACT INSTRUCTIONS

**YOUR TURN:** Analyze the current situation and decide the next best action.

**REASONING PROCESS:**
1. What is the current state?
2. What information do I need?
3. Which tool would help most?
4. What parameters should I use?

**ACTION TYPES:**
- **tool_call**: Use a tool with specific parameters
- **final_answer**: Provide the final response

**WHEN TO STOP:**
- When you have all necessary information
- When the objective is clearly achieved
- When no more productive actions are available

**FORMAT YOUR RESPONSE:**
\`\`\`
Thought: [Your reasoning]
Action: [tool_name or final_answer]
Parameters: [JSON object if tool_call]
\`\`\``;
    }

    private getReWooInstructions(): string {
        return `## 📋 REWOO PLANNING INSTRUCTIONS

**CREATE A STRUCTURED PLAN** using the available tools above.

**PLANNING REQUIREMENTS:**
1. **Break down** the goal into independent subtasks
2. **Identify** which tool to use for each subtask
3. **Specify** exact parameters for each tool call
4. **Define** dependencies between tasks
5. **Ensure** all required data is available

**OUTPUT FORMAT:**
\`\`\`json
{
  "plan": [
    {
      "id": "step-1",
      "description": "What this step accomplishes",
      "tool": "exact_tool_name",
      "parameters": {
        "param1": "value1",
        "param2": "value2"
      },
      "dependencies": []
    }
  ]
}
\`\`\`

**VALIDATION CHECKLIST:**
- ✅ All required parameters are specified
- ✅ Tool names match exactly
- ✅ No circular dependencies
- ✅ All subtasks contribute to the main goal
- ✅ Parameters are realistic and obtainable`;
    }

    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}

/**
 * Sistema de validação de estratégias
 */
export class StrategyValidator {
    validateStrategyContext(context: {
        input?: string;
        tools?: Tool[];
        agentContext?: AgentContext;
    }): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!context.input?.trim()) {
            errors.push('Input cannot be empty');
        }

        if (!Array.isArray(context.tools)) {
            errors.push('Tools must be an array');
        } else {
            context.tools?.forEach((tool, index) => {
                if (!tool.name) {
                    errors.push(`Tool at index ${index} missing name`);
                }
                if (!tool.description) {
                    errors.push(`Tool at index ${index} missing description`);
                }
            });
        }

        if (!context.agentContext) {
            errors.push('Agent context is required');
        } else {
            if (!context.agentContext.agentName) {
                errors.push('Agent name is required');
            }
            if (!context.agentContext.sessionId) {
                errors.push('Session ID is required');
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    validateComposedPrompt(prompt: string): {
        valid: boolean;
        warnings: string[];
        metrics: any;
    } {
        const warnings: string[] = [];
        const metrics = {
            length: prompt.length,
            lines: prompt.split('\n').length,
            sections: (prompt.match(/^## /gm) || []).length,
            hasSystemPrompt: prompt.includes('You are'),
            hasInstructions: prompt.includes('INSTRUCTIONS'),
            hasTools: prompt.includes('AVAILABLE TOOLS'),
            estimatedTokens: Math.ceil(prompt.length / 4),
        };

        if (metrics.length < 100) {
            warnings.push('Prompt is very short');
        }

        if (metrics.estimatedTokens > 8000) {
            warnings.push('Prompt may exceed token limits');
        }

        if (!metrics.hasSystemPrompt) {
            warnings.push('Missing system prompt/persona');
        }

        if (!metrics.hasInstructions) {
            warnings.push('Missing clear instructions');
        }

        return {
            valid: warnings.length === 0,
            warnings,
            metrics,
        };
    }

    validateStrategyFit(
        input: string,
        tools: Tool[],
        strategy: 'react' | 'rewoo',
    ): { recommended: string; reasoning: string; confidence: number } {
        const complexity = this.calculateComplexity(input, tools);

        if (complexity >= 5) {
            if (strategy === 'react') {
                return {
                    recommended: 'rewoo',
                    reasoning:
                        'High complexity task would benefit from structured planning',
                    confidence: 0.8,
                };
            }
        } else {
            if (strategy === 'rewoo') {
                return {
                    recommended: 'react',
                    reasoning:
                        'Simple task may not need complex planning overhead',
                    confidence: 0.6,
                };
            }
        }

        return {
            recommended: strategy,
            reasoning: 'Strategy fits task complexity well',
            confidence: 0.9,
        };
    }

    private calculateComplexity(input: string, tools: Tool[]): number {
        let complexity = 0;

        complexity += tools.length;

        if (input.length > 100) complexity += 1;
        if (input.length > 500) complexity += 2;

        const complexKeywords =
            /analyze|create|generate|build|integrate|workflow|plan/i;
        if (complexKeywords.test(input)) complexity += 2;

        const actionKeywords = /and|then|after|before|while|until/i;
        if (actionKeywords.test(input)) complexity += 1;

        return complexity;
    }
}

/**
 * Sistema de métricas para estratégias
 */
export class StrategyMetrics {
    private readonly logger: Logger = createLogger('strategy-metrics');
    private metrics: Map<string, any> = new Map();

    recordExecutionMetrics(
        strategy: string,
        context: {
            inputLength: number;
            toolsCount: number;
            executionTime: number;
            steps: number;
            success: boolean;
            errors?: string[];
        },
    ): void {
        const key = `${strategy}-${Date.now()}`;
        const metrics = {
            timestamp: Date.now(),
            strategy,
            inputLength: context.inputLength,
            toolsCount: context.toolsCount,
            executionTime: context.executionTime,
            steps: context.steps,
            success: context.success,
            errors: context.errors || [],
            efficiency: context.executionTime / Math.max(context.steps, 1),
            toolUtilization: context.steps / Math.max(context.toolsCount, 1),
        };

        this.metrics.set(key, metrics);

        this.logger.info('Strategy execution metrics recorded', {
            strategy,
            success: context.success,
            executionTime: context.executionTime,
            steps: context.steps,
        });
    }

    getAggregatedStats(strategy?: string): any {
        const relevantMetrics = strategy
            ? Array.from(this.metrics.values()).filter(
                  (m) => m.strategy === strategy,
              )
            : Array.from(this.metrics.values());

        if (relevantMetrics.length === 0) {
            return { message: 'No metrics available' };
        }

        const totalExecutions = relevantMetrics.length;
        const successfulExecutions = relevantMetrics.filter(
            (m) => m.success,
        ).length;
        const avgExecutionTime =
            relevantMetrics.reduce((sum, m) => sum + m.executionTime, 0) /
            totalExecutions;
        const avgSteps =
            relevantMetrics.reduce((sum, m) => sum + m.steps, 0) /
            totalExecutions;
        const successRate = successfulExecutions / totalExecutions;

        return {
            totalExecutions,
            successfulExecutions,
            successRate: Math.round(successRate * 100) / 100,
            avgExecutionTime: Math.round(avgExecutionTime),
            avgSteps: Math.round(avgSteps * 10) / 10,
            strategy: strategy || 'all',
        };
    }

    analyzeTrends(): any {
        const recentMetrics = Array.from(this.metrics.values())
            .filter((m) => Date.now() - m.timestamp < 24 * 60 * 60 * 1000)
            .sort((a, b) => b.timestamp - a.timestamp);

        if (recentMetrics.length < 5) {
            return { message: 'Insufficient data for trend analysis' };
        }

        const avgSuccessRate =
            recentMetrics
                .slice(0, 10)
                .reduce((sum, m) => sum + (m.success ? 1 : 0), 0) / 10;
        const avgExecutionTime =
            recentMetrics
                .slice(0, 10)
                .reduce((sum, m) => sum + m.executionTime, 0) / 10;

        return {
            period: 'last 10 executions',
            avgSuccessRate: Math.round(avgSuccessRate * 100) / 100,
            avgExecutionTime: Math.round(avgExecutionTime),
            trend: avgSuccessRate > 0.8 ? 'stable' : 'needs_attention',
        };
    }

    cleanupOldMetrics(daysOld: number = 7): number {
        const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;
        const oldKeys: string[] = [];

        for (const [key, metrics] of this.metrics) {
            if (metrics.timestamp < cutoffTime) {
                oldKeys.push(key);
            }
        }

        oldKeys.forEach((key) => this.metrics.delete(key));

        this.logger.info('Old metrics cleaned up', {
            removed: oldKeys.length,
            remaining: this.metrics.size,
        });

        return oldKeys.length;
    }
}

/**
 * Utilitários de formatação
 */
export class FormattingHelpers {
    static formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${Math.round(ms / 1000)}s`;
        if (ms < 3600000) return `${Math.round(ms / 60000)}min`;
        return `${Math.round(ms / 3600000)}h`;
    }

    static formatNumber(num: number): string {
        return new Intl.NumberFormat('pt-BR').format(num);
    }

    static formatPercentage(value: number, total: number): string {
        const percentage = total > 0 ? (value / total) * 100 : 0;
        return `${Math.round(percentage)}%`;
    }

    static formatDataSize(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${Math.round(size * 10) / 10}${units[unitIndex]}`;
    }

    static formatRelativeTime(timestamp: number): string {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (minutes < 1) return 'agora';
        if (minutes < 60) return `${minutes}min atrás`;
        if (hours < 24) return `${hours}h atrás`;
        return `${days}d atrás`;
    }

    static sanitizeForPrompt(text: string): string {
        return text
            .replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&')
            .replace(/\n/g, '\\n')
            .replace(/\t/g, '\\t')
            .trim();
    }

    static smartTruncate(
        text: string,
        maxLength: number,
        suffix: string = '...',
    ): string {
        if (text.length <= maxLength) return text;

        const truncated = text.substring(0, maxLength - suffix.length);
        const lastSpaceIndex = truncated.lastIndexOf(' ');

        if (lastSpaceIndex > maxLength * 0.7) {
            return truncated.substring(0, lastSpaceIndex) + suffix;
        }

        return truncated + suffix;
    }
}

/**
 * Facade unificado para todos os utilitários
 */
export class StrategyUtils {
    private readonly composer: StrategyPromptComposer;
    private readonly validator: StrategyValidator;
    private readonly metrics: StrategyMetrics;
    private readonly formatters: StrategyFormatters;

    constructor() {
        this.formatters = new StrategyFormatters();
        this.composer = new StrategyPromptComposer(this.formatters);
        this.validator = new StrategyValidator();
        this.metrics = new StrategyMetrics();

        this.composeReActPrompt = this.composer.composeReActPrompt.bind(
            this.composer,
        );
        this.composeReWooPrompt = this.composer.composeReWooPrompt.bind(
            this.composer,
        );
        this.validateStrategyContext =
            this.validator.validateStrategyContext.bind(this.validator);
        this.validateComposedPrompt =
            this.validator.validateComposedPrompt.bind(this.validator);
        this.validateStrategyFit = this.validator.validateStrategyFit.bind(
            this.validator,
        );
        this.recordExecutionMetrics = this.metrics.recordExecutionMetrics.bind(
            this.metrics,
        );
        this.getAggregatedStats = this.metrics.getAggregatedStats.bind(
            this.metrics,
        );
        this.analyzeTrends = this.metrics.analyzeTrends.bind(this.metrics);
        this.cleanupOldMetrics = this.metrics.cleanupOldMetrics.bind(
            this.metrics,
        );

        this.formatToolParameters = this.formatters.formatToolParameters.bind(
            this.formatters,
        );
        this.formatToolsList = this.formatters.formatToolsList.bind(
            this.formatters,
        );
        this.formatAdditionalContext =
            this.formatters.formatAdditionalContext.bind(this.formatters);
        this.formatAgentContext = this.formatters.formatAgentContext.bind(
            this.formatters,
        );
        this.formatReplanContext = this.formatters.formatReplanContext.bind(
            this.formatters,
        );
        this.formatOutputSchema = this.formatters.formatOutputSchema.bind(
            this.formatters,
        );

        this.estimateComplexity = this.formatters.estimateComplexity.bind(
            this.formatters,
        );
        this.estimateTokenCount = this.formatters.estimateTokenCount.bind(
            this.formatters,
        );
        this.estimateResources = this.formatters.estimateResources.bind(
            this.formatters,
        );
    }

    composeReActPrompt: any;
    composeReWooPrompt: any;
    validateStrategyContext: any;
    validateComposedPrompt: any;
    validateStrategyFit: any;
    recordExecutionMetrics: any;
    getAggregatedStats: any;
    analyzeTrends: any;
    cleanupOldMetrics: any;
    formatToolParameters: any;
    formatToolsList: any;
    formatAdditionalContext: any;
    formatAgentContext: any;
    formatReplanContext: any;
    formatOutputSchema: any;
    estimateComplexity: any;
    estimateTokenCount: any;
    estimateResources: any;

    static formatDuration = FormattingHelpers.formatDuration;
    static formatNumber = FormattingHelpers.formatNumber;
    static formatPercentage = FormattingHelpers.formatPercentage;
    static formatDataSize = FormattingHelpers.formatDataSize;
    static formatRelativeTime = FormattingHelpers.formatRelativeTime;
    static sanitizeForPrompt = FormattingHelpers.sanitizeForPrompt;
    static smartTruncate = FormattingHelpers.smartTruncate;
}

export default StrategyUtils;
