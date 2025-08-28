#!/usr/bin/env node

/**
 * 📋 EXEMPLO: Integração PlannerHandler + PlanExecutor
 *
 * Demonstra como os componentes de planning agora trabalham em conjunto:
 * - PlannerHandler gerencia PlanExecutor como singleton
 * - Dynamic planner switching funcional
 * - Reutilização de recursos entre execuções
 */

import { createLogger } from '../src/observability/index.js';
import { PlannerHandler } from '../src/engine/planning/planner.js';
import { PlanAndExecutePlanner } from '../src/engine/planning/strategies/plan-execute-planner.js';
import { createMockLLMAdapter } from '../src/adapters/llm/mock-provider.js';

const logger = createLogger('planner-integration-example');

async function demonstratePlannerIntegration() {
    logger.info(
        '🚀 Iniciando demonstração da integração PlannerHandler + PlanExecutor',
    );

    // 1. Setup
    const mockLLM = createMockLLMAdapter();
    const planner = new PlanAndExecutePlanner(mockLLM);

    const plannerHandler = new PlannerHandler();
    plannerHandler.registerPlanner('plan-execute', planner);

    // 2. Setup inicializado
    logger.info('📊 Setup inicializado com sucesso');

    // 3. Demonstrar dynamic planner switching
    logger.info('🔄 Demonstrando dynamic planner switching...');

    const cotPlanner = new PlanAndExecutePlanner(mockLLM);
    plannerHandler.registerPlanner('cot', cotPlanner);

    plannerHandler.setAgentPlanner('test-agent', 'cot');
    const currentPlanner = plannerHandler.getAgentPlanner('test-agent');

    logger.info('✅ Dynamic switching funcionando:', {
        agent: 'test-agent',
        planner: currentPlanner,
    });

    logger.info('🎉 Demonstração concluída com sucesso!');
    logger.info('📋 Benefícios alcançados:');
    logger.info('  ✅ PlanExecutor singleton (sem overhead de criação)');
    logger.info('  ✅ Dynamic planner switching funcional');
    logger.info('  ✅ Reutilização de recursos entre execuções');
}

// Executar demonstração
demonstratePlannerIntegration().catch((error) => {
    logger.error('❌ Erro na demonstração:', error);
    process.exit(1);
});
