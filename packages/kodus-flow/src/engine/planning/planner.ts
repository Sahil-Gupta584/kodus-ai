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
} from '@/core/types/allTypes.js';
import { MultiKernelHandler } from '../core/multi-kernel-handler.js';

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
    private planningStats = {
        total: 0,
        success: 0,
        failed: 0,
        duration: 0,
    };

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

    async handlePlanning(event: Event): Promise<Event> {
        const startTime = Date.now();
        this.planningStats.total++;

        // Emit planning start event via KernelHandler
        if (this.kernelHandler) {
            await this.kernelHandler.emit('planner.start', {
                eventId: event.id,
                eventType: event.type,
                startTime,
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

            // 🔥 CALLBACK: onPlanStart
            this.callbacks?.onPlanStart?.(goal, agentContext, planner.strategy);

            // Create plan using selected planner (callbacks já são chamados dentro da estratégia)
            const plan = await planner.createPlan(
                goal,
                agentContext,
                { ...options, context: planContext },
                this.callbacks,
            );

            // Store active plan
            this.activePlans.set(plan.id, plan);

            // Update stats
            this.updatePlanningStats(
                true,
                Date.now() - startTime,
                planner.strategy,
            );

            // 🔥 CALLBACK: onPlanComplete (já chamado dentro da estratégia)

            // Emit planning success event via KernelHandler
            if (this.kernelHandler) {
                await this.kernelHandler.emit('planner.success', {
                    planId: plan.id,
                    strategy: plan.strategy,
                    stepsCount: plan.steps.length,
                    agentName,
                    correlationId,
                    duration: Date.now() - startTime,
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
            // 🔥 CALLBACK: onPlanError
            this.callbacks?.onPlanError?.(
                error instanceof Error ? error : new Error(String(error)),
            );

            // Emit planning error event via KernelHandler
            if (this.kernelHandler) {
                await this.kernelHandler.emit('planner.error', {
                    error: (error as Error).message,
                    duration: Date.now() - startTime,
                });
            }

            this.updatePlanningStats(false, Date.now() - startTime);

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
     * Update planning statistics
     */
    private updatePlanningStats(
        success: boolean,
        duration: number,
        _strategy?: PlanningStrategy,
    ): void {
        if (success) {
            this.planningStats.success++;
        } else {
            this.planningStats.failed++;
        }

        // Update average planning time
        const currentAvg = this.planningStats.duration;
        const total = this.planningStats.total;
        this.planningStats.duration =
            (currentAvg * (total - 1) + duration) / total;
    }

    /**
     * Get planning statistics
     */
    getPlanningStats(): typeof this.planningStats & { successRate: number } {
        const successRate =
            this.planningStats.total > 0
                ? this.planningStats.success / this.planningStats.total
                : 0;

        return {
            ...this.planningStats,
            successRate,
        };
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
            return planner?.strategy || 'cot';
        },
    };
}
