/**
 * @module index
 * @description Kodus Flow - Framework para orquestração de agentes de IA
 *
 * Observabilidade automática habilitada por padrão.
 */

// ✅ CONFIGURAR OBSERVABILIDADE AUTOMATICAMENTE
import 'dotenv/config';

import { getObservability } from './observability/index.js';

const obs = getObservability({
    environment:
        (process.env.NODE_ENV as 'development' | 'production' | 'test') ||
        'development',

    logging: {
        enabled: true,
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    telemetry: {
        enabled: true,
        sampling: {
            rate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
            strategy: 'probabilistic',
        },
    },
});

// ✅ TODOS OS COMPONENTES SÃO OBSERVADOS AUTOMATICAMENTE
export { createOrchestration } from './orchestration/index.js';

// ✅ LLM INTEGRATION (Direct LangChain Support)
export {
    createDirectLLMAdapter,
    createLLMAdapter,
} from './core/llm/direct-llm-adapter.js';
export type {
    DirectLLMAdapter,
    LangChainLLM,
    LangChainMessage,
    LangChainResponse,
    LangChainOptions,
    PlanningResult,
    RoutingResult,
} from './core/llm/direct-llm-adapter.js';

// ✅ LEGACY LLM INTEGRATION (Backwards compatibility)
export { createLangChainProvider } from './core/llm/providers/langchain-provider.js';
export type {
    LLMAdapter,
    LLMProvider,
    LLMMessage,
    LLMResponse,
    LLMOptions,
} from './core/llm/llm-adapter.js';
export type { LangChainProvider } from './core/llm/providers/langchain-provider.js';
// export { AgentEngine } from './engine/agents/agent-engine.js';
// export { ToolEngine } from './engine/tools/tool-engine.js';
// export { WorkflowEngine } from './engine/workflows/workflow-engine.js';

// ✅ TIPOS PRINCIPAIS
export type {
    OrchestrationConfig,
    OrchestrationResult,
} from './orchestration/index.js';
export type {
    AgentDefinition,
    AgentExecutionOptions,
} from './core/types/agent-types.js';
export type { ToolDefinition } from './core/types/tool-types.js';
export type { WorkflowDefinition } from './core/types/workflow-types.js';

// ✅ OBSERVABILIDADE PARA USUÁRIOS
export { getObservability, createLogger } from './observability/index.js';
export { getSDKConfig } from './observability/config/sdk-config.js';

// ✅ UTILITÁRIOS
export { IdGenerator } from './utils/id-generator.js';

// ✅ ADAPTERS
export { createMCPAdapter } from './adapters/index.js';

// ✅ CONFIGURAÇÃO AUTOMÁTICA
export const config = {
    observability: obs,
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '0.0.0',
};

// ✅ HEALTH CHECK AUTOMÁTICO
export async function healthCheck() {
    return obs.getHealthStatus();
}

// ✅ MÉTRICAS AUTOMÁTICAS
export function getMetrics() {
    return obs.monitor?.getSystemMetrics() || null;
}

// ✅ RELATÓRIO AUTOMÁTICO
export function generateReport() {
    return obs.generateReport();
}
