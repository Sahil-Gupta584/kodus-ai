import {
    LLMAdapter,
    Planner,
    PlannerType,
    ReplanPolicyConfig,
} from '@/core/types/allTypes.js';
import { createLogger } from '../../observability/index.js';
import { PlanAndExecutePlanner } from './strategies/plan-execute-planner.js';

export class PlannerFactory {
    private static logger = createLogger('planner-factory');

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
                    undefined,
                    options?.replanPolicy,
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
}
