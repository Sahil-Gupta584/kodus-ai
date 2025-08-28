import { BaseExecutionStrategy } from './strategy-interface.js';
import { createStopConditions } from './stop-conditions.js';
import { SharedStrategyMethods } from './shared-methods.js';
import type {
    StrategyExecutionContext,
    ExecutionResult,
    ExecutionStep,
    StopCondition,
} from './types.js';

// ReWoo Strategy (simplificado - sem integração complexa)
export class ReWooStrategy extends BaseExecutionStrategy {
    readonly name = 'rewoo' as const;

    async execute(context: StrategyExecutionContext): Promise<ExecutionResult> {
        const startTime = Date.now();
        const steps: ExecutionStep[] = [];

        try {
            // 1. PLAN: Cria plano estratégico (usando shared methods)
            const planStep = this.createStep('plan', { timestamp: startTime });
            const plan = await SharedStrategyMethods.createPlan(context);
            planStep.metadata = { plan };
            steps.push(planStep);

            // 2. EXECUTE: Executa plano com stop conditions
            const executionStopConditions = this.getStopConditions(context);
            const executionSteps = await this.executeWithStopConditions(
                context,
                executionStopConditions,
                async (stepIndex) =>
                    await this.executePlanStep(plan, context, stepIndex),
            );
            steps.push(...executionSteps);

            // 3. SYNTHESIZE: Sintetiza resposta final
            const synthesizeStep = this.createStep('synthesize', {
                timestamp: Date.now(),
            });
            const synthesis =
                await SharedStrategyMethods.extractSynthesisOutput(
                    steps,
                    context,
                );
            synthesizeStep.metadata = { synthesis };
            steps.push(synthesizeStep);

            return this.createExecutionResult(
                this.name,
                steps,
                synthesis.output,
                startTime,
            );
        } catch (error) {
            return this.createExecutionResult(
                this.name,
                steps,
                'Error during execution',
                startTime,
                false,
                error instanceof Error ? error.message : 'Unknown error',
            );
        }
    }

    // EXECUTE: Executa step do plano
    private async executePlanStep(
        plan: any, // Simplified for now
        context: StrategyExecutionContext,
        stepIndex: number,
    ): Promise<ExecutionStep> {
        const stepStartTime = Date.now();

        if (stepIndex >= (plan.steps?.length || 0)) {
            // Plano completo
            return this.createStep('execute', {
                timestamp: stepStartTime,
                metadata: {
                    message: 'Plan execution complete',
                    completedSteps: plan.steps?.length || 0,
                },
            });
        }

        const planStep = plan.steps?.[stepIndex];

        // Executa step do plano
        const executeStep = this.createStep('execute', {
            timestamp: stepStartTime,
        });

        try {
            const result = await SharedStrategyMethods.executePlanStepAction(
                planStep,
                context,
            );

            executeStep.metadata = {
                planStep,
                result,
                duration: Date.now() - stepStartTime,
            };
        } catch (error) {
            executeStep.metadata = {
                planStep,
                error: error instanceof Error ? error.message : 'Unknown error',
                duration: Date.now() - stepStartTime,
            };
        }

        return executeStep;
    }

    private getStopConditions(
        context: StrategyExecutionContext,
    ): StopCondition[] {
        const config = context.config.stopConditions?.rewoo || {};
        return createStopConditions.rewoo({
            maxPlanSteps: config.maxPlanSteps || 15,
            maxToolCalls: config.maxToolCalls || 30,
        });
    }
}
