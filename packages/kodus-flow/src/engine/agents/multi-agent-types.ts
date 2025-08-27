// export interface AgentCapability {
//     domain: string; // e.g., "security", "performance", "quality"
//     skills: string[]; // e.g., ["vulnerability_scan", "code_review"]
//     inputTypes: string[]; // Tipos de input que o agente pode processar
//     outputTypes: string[]; // Tipos de output que o agente pode gerar
//     load: number; // 0-100, current workload
//     priority: number; // Agent priority level
//     availability: boolean; // Is agent available
//     performance: {
//         averageResponseTime: number;
//         successRate: number;
//         lastUsed: number;
//     };
// }

// // ──────────────────────────────────────────────────────────────────────────────
// // 🧩 MESSAGE TYPES
// // ──────────────────────────────────────────────────────────────────────────────

// /**
//  * Mensagem entre agentes
//  */
// export interface AgentMessage {
//     id: string;
//     fromAgent: string;
//     toAgent: string;
//     type: 'request' | 'response' | 'notification' | 'delegation';
//     content: unknown;
//     timestamp: number;
//     correlationId?: string;
//     sessionId?: string;
//     metadata?: Record<string, unknown>;
// }

// // ──────────────────────────────────────────────────────────────────────────────
// // 🧩 COORDINATION TYPES
// // ──────────────────────────────────────────────────────────────────────────────

// /**
//  * Estratégias de coordenação de agentes
//  */
// export type AgentCoordinationStrategy =
//     | 'sequential' // Execução sequencial
//     | 'parallel' // Execução paralela
//     | 'competition' // Competição entre agentes
//     | 'collaboration' // Colaboração entre agentes
//     | 'delegation' // Delegação hierárquica
//     | 'voting' // Votação entre agentes
//     | 'consensus' // Consenso entre agentes
//     | 'pipeline' // Pipeline de processamento
//     | 'custom'; // Estratégia customizada

// /**
//  * Critérios para seleção de agentes
//  */
// export interface AgentSelectionCriteria {
//     requiredSkills?: string[];
//     requiredDomain?: string;
//     minSuccessRate?: number;
//     maxLoad?: number;
//     minPriority?: number;
//     preferredAgents?: string[];
//     excludedAgents?: string[];
//     maxResponseTime?: number;
//     requiredInputTypes?: string[];
//     requiredOutputTypes?: string[];
//     tags?: string[];
//     metadata?: Record<string, unknown>;
// }

// /**
//  * Contexto para coordenação multi-agente
//  */
// export interface MultiAgentContext {
//     coordinationId: string;
//     strategy: AgentCoordinationStrategy;
//     criteria: AgentSelectionCriteria;
//     availableAgents: string[];
//     startTime: number;
//     correlationId?: string;
//     sessionId?: string;
//     metadata?: Record<string, unknown>;
// }

// /**
//  * Resultado de coordenação multi-agente
//  */
// export interface MultiAgentResult {
//     status: 'completed' | 'failed' | 'partial' | 'timeout';
//     result: unknown;
//     error?: string;
//     coordinationId: string;
//     duration: number;
//     strategy: AgentCoordinationStrategy;
//     participatingAgents: string[];
//     agentResults?: Record<
//         string,
//         {
//             success: boolean;
//             result?: unknown;
//             error?: string;
//             duration: number;
//         }
//     >;
//     metadata?: Record<string, unknown>;
// }

// // ──────────────────────────────────────────────────────────────────────────────
// // 🧩 AGENT INTERFACE (NÃO IMPERATIVE)
// // ──────────────────────────────────────────────────────────────────────────────

// /**
//  * Interface de agente para coordenação (sem usar types imperative)
//  */
// export interface CoordinatableAgent<TInput = unknown, TOutput = unknown> {
//     name: string;
//     definition: AgentDefinition<TInput, TOutput>;

//     // Método principal de execução
//     process(input: TInput, context?: Partial<AgentContext>): Promise<TOutput>;

//     // Método para verificar disponibilidade
//     isAvailable(): boolean;

//     // Método para obter capacidades
//     getCapabilities(): AgentCapability;

//     // Método para obter carga atual
//     getCurrentLoad(): number;

//     // Método para atualizar métricas
//     updateMetrics(metrics: {
//         latency: number;
//         success: boolean;
//         cost?: number;
//     }): void;
// }

// // ──────────────────────────────────────────────────────────────────────────────
// // 🧩 WORKFLOW STEP TYPES
// // ──────────────────────────────────────────────────────────────────────────────

// /**
//  * Contexto de execução de workflow step
//  */
// export interface WorkflowStepContext {
//     executionId: string;
//     correlationId: string;
//     sessionId?: string;
//     tenantId: string;
//     metadata?: Record<string, unknown>;
// }

// /**
//  * Interface de workflow step
//  */
// export interface WorkflowStep<TInput = unknown, TOutput = unknown> {
//     name: string;
//     execute(input: TInput, context: WorkflowStepContext): Promise<TOutput>;
// }

// // ──────────────────────────────────────────────────────────────────────────────
// // 🧩 HELPER TYPES
// // ──────────────────────────────────────────────────────────────────────────────

// /**
//  * Status de entrega de mensagem
//  */
// export type MessageStatus = 'pending' | 'delivered' | 'failed' | 'acknowledged';

// /**
//  * Mensagem rastreada com status de entrega
//  */
// export interface TrackedMessage extends AgentMessage {
//     status: MessageStatus;
//     deliveryAttempts: number;
//     maxAttempts: number;
//     createdAt: number;
//     deliveredAt?: number;
//     acknowledgedAt?: number;
//     error?: string;
// }

// /**
//  * Agente registrado com métricas
//  */
// export interface RegisteredAgent {
//     agent: CoordinatableAgent<unknown, unknown>;
//     capabilities: AgentCapability;
//     metadata: Record<string, unknown>;
//     performance: {
//         averageLatency: number;
//         successRate: number;
//         totalExecutions: number;
//         lastExecution?: number;
//     };
//     isAvailable: boolean;
//     currentTasks: number;
//     maxConcurrentTasks: number;
// }

// /**
//  * Contexto de delegação
//  */
// export interface DelegationContext {
//     fromAgent: string;
//     targetAgent: string;
//     reason?: string;
//     timeout?: number;
//     priority?: 'low' | 'medium' | 'high' | 'critical';
//     chainLevel: number;
//     originalAgent?: string;
//     correlationId: string;
//     executionId: string;
//     startTime: number;
// }

// /**
//  * Resultado de delegação
//  */
// export interface DelegationResult {
//     success: boolean;
//     result?: unknown;
//     error?: string;
//     duration: number;
//     targetAgent: string;
//     fromAgent: string;
//     correlationId: string;
// }
