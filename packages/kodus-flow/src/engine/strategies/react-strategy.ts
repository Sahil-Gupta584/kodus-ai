import { BaseExecutionStrategy } from './strategy-interface.js';
import { createStopConditions } from './stop-conditions.js';
import { SharedStrategyMethods } from './shared-methods.js';
import type {
    StrategyExecutionContext,
    ExecutionResult,
    ExecutionStep,
    StopCondition,
} from './types.js';

// ReAct Strategy (Reasoning + Acting)
export class ReActStrategy extends BaseExecutionStrategy {
    readonly name = 'react' as const;

    async execute(context: StrategyExecutionContext): Promise<ExecutionResult> {
        const startTime = Date.now();
        const steps: ExecutionStep[] = [];

        try {
            // ReAct Loop: Think → Act → Observe
            const stopConditions = this.getStopConditions(context);
            const executionSteps = await this.executeWithStopConditions(
                context,
                stopConditions,
                async (stepIndex) =>
                    await this.executeReActStep(context, stepIndex),
            );
            steps.push(...executionSteps);

            // Extrai resultado final
            const finalOutput = SharedStrategyMethods.extractFinalOutput(steps);

            return this.createExecutionResult(
                this.name,
                steps,
                finalOutput,
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

    // EXECUTE: Step do ReAct (Think → Act → Observe)
    private async executeReActStep(
        context: StrategyExecutionContext,
        stepIndex: number,
    ): Promise<ExecutionStep> {
        const stepStartTime = Date.now();

        // 1. THINK: Gera thought
        const thinkStep = this.createStep('think', {
            timestamp: stepStartTime,
        });
        const thought = await SharedStrategyMethods.generateThought(
            context,
            stepIndex,
        );
        thinkStep.thought = thought;
        thinkStep.metadata = { ...thinkStep.metadata, stepIndex };

        // 2. ACT: Executa action
        const actStep = this.createStep('act', { timestamp: Date.now() });
        const actionResult = await SharedStrategyMethods.executeAction(
            thought.action,
            context,
        );
        actStep.action = thought.action;
        actStep.result = actionResult;
        actStep.metadata = { ...actStep.metadata, stepIndex };

        // 3. OBSERVE: Analisa resultado
        const observeStep = this.createStep('observe', {
            timestamp: Date.now(),
        });
        const resultAnalysis = await SharedStrategyMethods.analyzeResult(
            actionResult,
            context,
        );
        observeStep.observation = resultAnalysis;
        observeStep.metadata = { ...observeStep.metadata, stepIndex };

        // Retorna step combinado (Think-Act-Observe)
        return {
            ...thinkStep,
            type: 'think' as const,
            metadata: {
                ...thinkStep.metadata,
                actStep: actStep,
                observeStep: observeStep,
                duration: Date.now() - stepStartTime,
            },
        };
    }

    private getStopConditions(
        context: StrategyExecutionContext,
    ): StopCondition[] {
        const config = context.config.stopConditions?.react || {};
        return createStopConditions.react({
            maxTurns: config.maxTurns || 10,
            maxToolCalls: config.maxToolCalls || 20,
        });
    }
}
