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

export { createOrchestration } from './orchestration/index.js';

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

export type {
    LLMAdapter,
    LLMMessage,
    LLMResponse,
    LLMRequest,
    LLMConfig,
} from './adapters/llm/index.js';
export { createMockLLMProvider } from './adapters/llm/mock-provider.js';

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

export {
    getObservability,
    createLogger,
    createOtelTracerAdapter,
    shutdownObservability,
} from './observability/index.js';

export type {
    ObservabilityConfig,
    TelemetryConfig,
} from './observability/index.js';
export type { LogLevel, LogContext } from './observability/logger.js';
export type { OtelTracerAdapter } from './observability/otel-adapter.js';

export { IdGenerator } from './utils/id-generator.js';
export { createThreadId } from './utils/thread-helpers.js';
export type { Thread } from './core/types/common-types.js';

export { createMCPAdapter } from './adapters/index.js';
export type {
    MCPServerConfig,
    MCPAdapterConfig,
    MCPAdapter,
    MCPTool,
} from './adapters/mcp/types.js';

export type {
    PersistorType,
    PersistorConfig,
    MemoryPersistorConfig,
    MongoDBPersistorConfig,
} from './persistor/config.js';

export const config = {
    observability: obs,
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '0.0.0',
};
