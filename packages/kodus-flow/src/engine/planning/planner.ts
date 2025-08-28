import { createLogger } from '../../observability/index.js';
import { EngineError } from '../../core/errors.js';
import { createAgentContext } from '../../core/context/context-builder.js';

import {
    Plan,
    Planner,
    PlannerCallbacks,
    PlannerOptions,
    PlanningContext,
    PlanningStrategy,
    TEvent,
    AgentAction,
    ActionResult,
    PlanStep,
    PlannerExecutionContext,
    ExecutionPlan,
    PlanExecutionResult,
} from '@/core/types/allTypes.js';
import { MultiKernelHandler } from '../core/multi-kernel-handler.js';
import { PlanExecutor } from './executor/plan-executor.js';

// ──────────────────────────────────────────────────────────────────────────────
// 🧠 PLANNER HANDLER & REGISTRY
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Planner handler manages planning strategies for agents (HÍBRIDO)
 */
export class PlannerHandler {
    private logger = createLogger('planner-handler');
    private planners = new Map<string, Planner>();
    private activePlans = new Map<string, Plan>();
    private agentPlanners = new Map<string, string>(); // agentName -> plannerName
    private kernelHandler?: MultiKernelHandler;
    private callbacks?: PlannerCallbacks;
    private planExecutor?: PlanExecutor;

    constructor(
        kernelHandler?: MultiKernelHandler,
        callbacks?: PlannerCallbacks,
    ) {
        this.kernelHandler = kernelHandler;
        this.callbacks = callbacks;

        this.logger.info('PlannerHandler created', {
            hasKernelHandler: !!kernelHandler,
        });
    }

    async handlePlanning(event: TEvent): Promise<TEvent> {
        // Emit planning start event via KernelHandler
        if (this.kernelHandler) {
            await this.kernelHandler.emit('planner.start', {
                eventId: event.id,
                eventType: event.type,
                startTime: Date.now(),
            });
        }

        try {
            const {
                plannerName,
                goal,
                agentName,
                context: planContext = {},
                options = {},
                correlationId,
                executionId,
            } = event.data as {
                plannerName?: string;
                goal: string | string[];
                agentName: string;
                context?: Record<string, unknown>;
                options?: PlannerOptions;
                correlationId: string;
                executionId: string;
            };

            this.logger.debug('Processing planning request', {
                plannerName,
                goal,
                agentName,
                correlationId,
            });

            // 🎯 SUA VISÃO: Get planner for agent (pode ser setado dinamicamente)
            const selectedPlannerName =
                plannerName || this.agentPlanners.get(agentName) || 'cot';
            const planner = this.planners.get(selectedPlannerName);

            if (!planner) {
                throw new EngineError(
                    'AGENT_ERROR',
                    `Planner not found: ${selectedPlannerName}`,
                    {
                        context: {
                            plannerName: selectedPlannerName,
                            availablePlanners: Array.from(this.planners.keys()),
                        },
                    },
                );
            }

            // Create agent context using factory
            const agentContext = await createAgentContext({
                agentName,
                thread: {
                    id: executionId,
                    metadata: { description: 'Planner execution thread' },
                },
                correlationId, // Optional - will be generated if not provided
            });

            this.callbacks?.onPlanStart?.(goal, agentContext, planner.strategy);

            const plan = await planner.createPlan(
                goal,
                agentContext,
                { ...options, context: planContext },
                this.callbacks,
            );

            // Store active plan
            this.activePlans.set(plan.id, plan);

            if (this.kernelHandler) {
                await this.kernelHandler.emit('planner.success', {
                    planId: plan.id,
                    strategy: plan.strategy,
                    stepsCount: plan.steps.length,
                    agentName,
                    correlationId,
                });
            }

            this.logger.info('Planning completed successfully', {
                planId: plan.id,
                strategy: plan.strategy,
                stepsCount: plan.steps.length,
                agentName,
                correlationId,
            });

            return {
                id: `planner-planned-${Date.now()}`,
                type: 'planner.planned',
                threadId: event.threadId,
                data: {
                    plan,
                    plannerName: selectedPlannerName,
                    agentName,
                    correlationId,
                    executionId,
                },
                ts: Date.now(),
            };
        } catch (error) {
            this.callbacks?.onPlanError?.(
                error instanceof Error ? error : new Error(String(error)),
            );

            if (this.kernelHandler) {
                await this.kernelHandler.emit('planner.error', {
                    error: (error as Error).message,
                });
            }

            this.logger.error('Planning failed', error as Error);

            throw new EngineError('AGENT_ERROR', 'Planning failed', {
                context: {
                    originalError: error,
                    operation: 'planning',
                },
            });
        }
    }

    /**
     * 🎯 SUA VISÃO: Set planner for agent (dynamic switching)
     */
    setAgentPlanner(agentName: string, plannerName: string): void {
        if (!this.planners.has(plannerName)) {
            throw new EngineError(
                'AGENT_ERROR',
                `Planner not found: ${plannerName}`,
                {
                    context: {
                        plannerName,
                        availablePlanners: Array.from(this.planners.keys()),
                    },
                },
            );
        }

        this.agentPlanners.set(agentName, plannerName);
        this.logger.info('Agent planner updated', {
            agentName,
            plannerName,
        });
    }

    /**
     * Get planner for agent
     */
    getAgentPlanner(agentName: string): string {
        return this.agentPlanners.get(agentName) || 'cot';
    }

    /**
     * Register planner (MINHA IMPLEMENTAÇÃO)
     */
    registerPlanner(name: string, planner: Planner): void {
        this.planners.set(name, planner);
        this.logger.info('Planner registered', {
            plannerName: name,
            strategy: planner.strategy,
        });
    }

    /**
     * Get available planners
     */
    getAvailablePlanners(): string[] {
        return Array.from(this.planners.keys());
    }

    /**
     * Get active plan
     */
    getActivePlan(planId: string): Plan | undefined {
        return this.activePlans.get(planId);
    }

    /**
     * 🔥 REPLAN: Replan existing plan (API Target V2)
     */
    async replan(
        planId: string,
        reason: string,
        newGoal?: string | string[],
        options?: PlannerOptions,
    ): Promise<Plan> {
        const existingPlan = this.activePlans.get(planId);
        if (!existingPlan) {
            throw new EngineError('AGENT_ERROR', `Plan not found: ${planId}`);
        }

        this.logger.info('Starting replan', {
            planId,
            reason,
            agentName: existingPlan.agentName,
        });

        // 🔥 CALLBACK: onReplan
        this.callbacks?.onReplan?.(existingPlan, reason);

        // Get planner for the agent
        const plannerName = this.getAgentPlanner(existingPlan.agentName);
        const planner = this.planners.get(plannerName);
        if (!planner) {
            throw new EngineError(
                'AGENT_ERROR',
                `Planner not found: ${plannerName}`,
            );
        }

        // Create new agent context using factory
        const agentContext = await createAgentContext({
            agentName: existingPlan.agentName,
            thread: {
                id: `replan-${Date.now()}`,
                metadata: { description: 'Replan execution thread' },
            },
        });

        // 🔥 CALLBACK: onPlanStart (for replan)
        this.callbacks?.onPlanStart?.(
            newGoal || existingPlan.goal,
            agentContext,
            planner.strategy,
        );

        // Create new plan
        const newPlan = await planner.createPlan(
            newGoal || existingPlan.goal,
            agentContext,
            options,
            this.callbacks,
        );

        // 🔥 CALLBACK: onPlanStep (para cada step do novo plano)
        newPlan.steps.forEach((step, index) => {
            this.callbacks?.onPlanStep?.(step, index, newPlan);
        });

        // Update active plans
        this.activePlans.delete(planId);
        this.activePlans.set(newPlan.id, newPlan);

        // 🔥 CALLBACK: onPlanComplete (for replan)
        this.callbacks?.onPlanComplete?.(newPlan);

        this.logger.info('Replan completed', {
            oldPlanId: planId,
            newPlanId: newPlan.id,
            reason,
            stepsCount: newPlan.steps.length,
        });

        return newPlan;
    }

    /**
     * Cleanup resources
     */
    async dispose(): Promise<void> {
        this.planners.clear();
        this.activePlans.clear();
        this.agentPlanners.clear();
        this.logger.info('PlannerHandler disposed');
    }

    /**
     * Set KernelHandler (for dependency injection)
     */
    setKernelHandler(kernelHandler: MultiKernelHandler): void {
        this.kernelHandler = kernelHandler;
        this.logger.info('KernelHandler set for PlannerHandler');
    }

    /**
     * Get KernelHandler status
     */
    hasKernelHandler(): boolean {
        return !!this.kernelHandler;
    }

    /**
     * Get singleton PlanExecutor instance
     */
    getPlanExecutor(
        act: (action: AgentAction) => Promise<ActionResult>,
        resolveArgs: (
            rawArgs: Record<string, unknown>,
            stepList: PlanStep[],
            context: PlannerExecutionContext,
        ) => Promise<{ args: Record<string, unknown>; missing: string[] }>,
    ): PlanExecutor {
        if (!this.planExecutor) {
            this.logger.info('🏗️ Creating singleton PlanExecutor');
            this.planExecutor = new PlanExecutor(act, resolveArgs, {
                enableReWOO: true,
            });
        }
        return this.planExecutor;
    }

    /**
     * Execute plan using managed PlanExecutor
     */
    async executePlan(
        plan: ExecutionPlan,
        context: PlannerExecutionContext,
        act: (action: AgentAction) => Promise<ActionResult>,
        resolveArgs: (
            rawArgs: Record<string, unknown>,
            stepList: PlanStep[],
            context: PlannerExecutionContext,
        ) => Promise<{ args: Record<string, unknown>; missing: string[] }>,
    ): Promise<PlanExecutionResult> {
        const executor = this.getPlanExecutor(act, resolveArgs);
        return await executor.run(plan, context);
    }
}

export function createPlannerHandler(
    callbacks?: PlannerCallbacks,
): PlannerHandler {
    return new PlannerHandler(undefined, callbacks);
}

/**
 * Create planning context extension
 */
export function createPlanningContext(
    agentName: string,
    plannerHandler: PlannerHandler,
    correlationId: string,
    executionId: string,
    threadId: string,
): PlanningContext {
    return {
        async plan(
            goal: string | string[],
            options?: PlannerOptions,
        ): Promise<Plan> {
            // Simulate event-driven planning via PlannerHandler
            const event = {
                id: `planner-plan-${Date.now()}`,
                type: 'planner.plan',
                threadId: threadId,
                data: {
                    goal,
                    agentName,
                    options,
                    correlationId,
                    executionId,
                },
                ts: Date.now(),
            };

            const result = await plannerHandler.handlePlanning(event);
            return (result.data as { plan: Plan }).plan;
        },

        setPlanner(strategy: PlanningStrategy): void {
            plannerHandler.setAgentPlanner(agentName, strategy);
        },

        getPlanner(): PlanningStrategy {
            const plannerName = plannerHandler.getAgentPlanner(agentName);
            const planner = plannerHandler['planners'].get(plannerName);
            return planner?.strategy || PlanningStrategy.PLAN_EXECUTE;
        },
    };
}
