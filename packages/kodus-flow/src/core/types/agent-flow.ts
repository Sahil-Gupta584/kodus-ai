// /**
//  * 🎯 AGENT FLOW INTEGRATION
//  *
//  * Como cada fase se integra e casos de uso práticos
//  */

// import type { AgentStatus } from './agent-status.js';

// // ═══════════════════════════════════════════════════════════════════════════════
// // 🔄 FLUXO PRINCIPAL DO AGENT
// // ═══════════════════════════════════════════════════════════════════════════════

// /**
//  * Fluxo principal do agent: Think → Act → Observe → Repeat
//  */
// export interface AgentFlow {
//     // 🧠 THINK PHASE
//     think: {
//         input: string;
//         context: Record<string, unknown>;
//         status: AgentStatus;
//         output: {
//             reasoning: string;
//             action: AgentAction;
//             confidence: number;
//         };
//     };

//     // 🚀 ACT PHASE
//     act: {
//         action: AgentAction;
//         status: AgentStatus;
//         output: {
//             result: unknown;
//             success: boolean;
//             error?: string;
//         };
//     };

//     // 👁️ OBSERVE PHASE
//     observe: {
//         input: {
//             thought: AgentThought;
//             action: AgentAction;
//             result: unknown;
//         };
//         status: AgentStatus;
//         output: {
//             isComplete: boolean;
//             isSuccessful: boolean;
//             feedback: string;
//             shouldContinue: boolean;
//             suggestedNextAction?: string;
//         };
//     };
// }

// // ═══════════════════════════════════════════════════════════════════════════════
// // 🎯 CASOS DE USO PRÁTICOS
// // ═══════════════════════════════════════════════════════════════════════════════

// /**
//  * Casos de uso organizados por complexidade
//  */
// export const AgentUseCases = {
//     // 🟢 CASOS SIMPLES (1-2 steps)
//     simple: {
//         // Usuário pergunta algo que não precisa de tools
//         directAnswer: {
//             input: 'Qual é a capital do Brasil?',
//             flow: [
//                 {
//                     phase: 'think',
//                     status: 'thinking',
//                     description: 'Analisa pergunta',
//                 },
//                 {
//                     phase: 'think',
//                     status: 'thinking_complete',
//                     description: 'Decide responder diretamente',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'acting',
//                     description: 'Gera resposta',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'acting_complete',
//                     description: 'Resposta pronta',
//                 },
//                 {
//                     phase: 'observe',
//                     status: 'observing',
//                     description: 'Avalia resposta',
//                 },
//                 {
//                     phase: 'observe',
//                     status: 'observing_complete',
//                     description: 'Resposta finalizada',
//                 },
//             ],
//             finalStatus: 'success_completed',
//         },

//         // Usuário pede para fazer uma ação simples
//         simpleToolCall: {
//             input: "Crie uma página no Notion com o título 'Teste'",
//             flow: [
//                 {
//                     phase: 'think',
//                     status: 'planning',
//                     description: 'Planeja ação',
//                 },
//                 {
//                     phase: 'think',
//                     status: 'thinking_complete',
//                     description: 'Plano criado',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'tool_calling',
//                     description: 'Chama Notion API',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'waiting_response',
//                     description: 'Aguarda resposta',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'acting_complete',
//                     description: 'Página criada',
//                 },
//                 {
//                     phase: 'observe',
//                     status: 'observing',
//                     description: 'Confirma sucesso',
//                 },
//                 {
//                     phase: 'observe',
//                     status: 'observing_complete',
//                     description: 'Tarefa finalizada',
//                 },
//             ],
//             finalStatus: 'success_completed',
//         },
//     },

//     // 🟡 CASOS MÉDIOS (3-5 steps)
//     medium: {
//         // Usuário pede algo que precisa de múltiplas steps
//         multiStepTask: {
//             input: 'Busque informações sobre o clima de São Paulo e crie um relatório no Notion',
//             flow: [
//                 {
//                     phase: 'think',
//                     status: 'planning',
//                     description: 'Cria plano com 2 steps',
//                 },
//                 {
//                     phase: 'think',
//                     status: 'thinking_complete',
//                     description: 'Plano: 1) Buscar clima 2) Criar relatório',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'plan_executing',
//                     description: 'Executa step 1',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'tool_calling',
//                     description: 'Chama API do clima',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'acting_complete',
//                     description: 'Clima obtido',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'plan_executing',
//                     description: 'Executa step 2',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'tool_calling',
//                     description: 'Cria relatório no Notion',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'acting_complete',
//                     description: 'Relatório criado',
//                 },
//                 {
//                     phase: 'observe',
//                     status: 'observing',
//                     description: 'Avalia resultado final',
//                 },
//                 {
//                     phase: 'observe',
//                     status: 'observing_complete',
//                     description: 'Tarefa completa',
//                 },
//             ],
//             finalStatus: 'success_completed',
//         },

//         // Usuário pede algo que pode falhar
//         taskWithPotentialFailure: {
//             input: 'Crie uma página no Notion e depois envie um email',
//             flow: [
//                 {
//                     phase: 'think',
//                     status: 'planning',
//                     description: 'Planeja 2 ações',
//                 },
//                 {
//                     phase: 'think',
//                     status: 'thinking_complete',
//                     description: 'Plano criado',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'plan_executing',
//                     description: 'Step 1: Notion',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'acting_complete',
//                     description: 'Página criada com sucesso',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'plan_executing',
//                     description: 'Step 2: Email',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'acting_failed',
//                     description: 'Falha no envio do email',
//                 },
//                 {
//                     phase: 'observe',
//                     status: 'observing',
//                     description: 'Analisa falha',
//                 },
//                 {
//                     phase: 'observe',
//                     status: 'observing_complete',
//                     description: 'Reporta sucesso parcial',
//                 },
//             ],
//             finalStatus: 'success_partial',
//         },
//     },

//     // 🔴 CASOS COMPLEXOS (5+ steps com replan)
//     complex: {
//         // Usuário pede algo complexo que precisa de replan
//         complexTaskWithReplan: {
//             input: 'Analise o código do projeto, identifique bugs, crie tickets no Jira e envie relatório',
//             flow: [
//                 // 🧠 PRIMEIRO PLANO
//                 {
//                     phase: 'think',
//                     status: 'planning',
//                     description: 'Cria plano inicial',
//                 },
//                 {
//                     phase: 'think',
//                     status: 'thinking_complete',
//                     description: 'Plano com 4 steps',
//                 },

//                 // 🚀 EXECUÇÃO INICIAL
//                 {
//                     phase: 'act',
//                     status: 'plan_executing',
//                     description: 'Step 1: Analisar código',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'acting_complete',
//                     description: 'Análise concluída',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'plan_executing',
//                     description: 'Step 2: Identificar bugs',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'acting_complete',
//                     description: 'Bugs identificados',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'plan_executing',
//                     description: 'Step 3: Criar tickets',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'acting_failed',
//                     description: 'Falha ao criar tickets (API down)',
//                 },

//                 // 👁️ OBSERVAÇÃO E REPLAN
//                 {
//                     phase: 'observe',
//                     status: 'observing',
//                     description: 'Analisa falha',
//                 },
//                 {
//                     phase: 'observe',
//                     status: 'observing_complete',
//                     description: 'Decide replan',
//                 },

//                 // 🔄 REPLAN
//                 {
//                     phase: 'think',
//                     status: 'replanning',
//                     description: 'Replaneja com contexto',
//                 },
//                 {
//                     phase: 'think',
//                     status: 'replan_analyzing',
//                     description: 'Analisa falhas anteriores',
//                 },
//                 {
//                     phase: 'think',
//                     status: 'replan_preserving',
//                     description: 'Preserva steps bem-sucedidos',
//                 },
//                 {
//                     phase: 'think',
//                     status: 'replan_generating',
//                     description: 'Gera novo plano',
//                 },
//                 {
//                     phase: 'think',
//                     status: 'thinking_complete',
//                     description: 'Novo plano: retry tickets + relatório',
//                 },

//                 // 🚀 EXECUÇÃO DO REPLAN
//                 {
//                     phase: 'act',
//                     status: 'plan_executing',
//                     description: 'Step 3 (retry): Criar tickets',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'acting_complete',
//                     description: 'Tickets criados com sucesso',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'plan_executing',
//                     description: 'Step 4: Enviar relatório',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'acting_complete',
//                     description: 'Relatório enviado',
//                 },

//                 // 👁️ OBSERVAÇÃO FINAL
//                 {
//                     phase: 'observe',
//                     status: 'observing',
//                     description: 'Avalia resultado final',
//                 },
//                 {
//                     phase: 'observe',
//                     status: 'observing_complete',
//                     description: 'Tarefa completa com replan',
//                 },
//             ],
//             finalStatus: 'success_completed',
//         },

//         // Usuário pede algo que gera deadlock
//         deadlockScenario: {
//             input: 'Crie uma página no Notion que dependa de dados que só existem após criar a página',
//             flow: [
//                 {
//                     phase: 'think',
//                     status: 'planning',
//                     description: 'Cria plano com dependência circular',
//                 },
//                 {
//                     phase: 'think',
//                     status: 'thinking_complete',
//                     description: 'Plano criado',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'plan_executing',
//                     description: 'Tenta executar steps',
//                 },
//                 {
//                     phase: 'act',
//                     status: 'execution_deadlock',
//                     description: 'Detecta deadlock',
//                 },
//                 {
//                     phase: 'observe',
//                     status: 'observing',
//                     description: 'Analisa deadlock',
//                 },
//                 {
//                     phase: 'observe',
//                     status: 'observing_complete',
//                     description: 'Reporta problema',
//                 },
//             ],
//             finalStatus: 'error_execution_failed',
//         },
//     },
// };

// // ═══════════════════════════════════════════════════════════════════════════════
// // 🔄 INTEGRAÇÃO ENTRE FASES
// // ═══════════════════════════════════════════════════════════════════════════════

// /**
//  * Como as fases se comunicam
//  */
// export interface PhaseIntegration {
//     // 🧠 THINK → ACT
//     thinkToAct: {
//         trigger: 'thinking_complete';
//         data: {
//             reasoning: string;
//             action: AgentAction;
//             confidence: number;
//         };
//         nextPhase: 'act';
//         nextStatus: 'acting';
//     };

//     // 🚀 ACT → OBSERVE
//     actToObserve: {
//         trigger: 'acting_complete' | 'acting_failed';
//         data: {
//             result: unknown;
//             success: boolean;
//             error?: string;
//         };
//         nextPhase: 'observe';
//         nextStatus: 'observing';
//     };

//     // 👁️ OBSERVE → THINK (para replan)
//     observeToThink: {
//         trigger: 'shouldContinue = true';
//         data: {
//             feedback: string;
//             suggestedNextAction?: string;
//             previousResults: unknown[];
//         };
//         nextPhase: 'think';
//         nextStatus: 'replanning';
//     };

//     // 👁️ OBSERVE → COMPLETE
//     observeToComplete: {
//         trigger: 'isComplete = true';
//         data: {
//             feedback: string;
//             finalResult: unknown;
//         };
//         nextPhase: 'complete';
//         nextStatus: 'agent_completed';
//     };
// }

// // ═══════════════════════════════════════════════════════════════════════════════
// // 🎯 STATUS TRANSITIONS
// // ═══════════════════════════════════════════════════════════════════════════════

// /**
//  * Transições de status permitidas
//  */
// export const StatusTransitions: Record<AgentStatus, AgentStatus[]> = {
//     // 🧠 THINK STATUS
//     thinking: [
//         'planning',
//         'replanning',
//         'analyzing',
//         'deciding',
//         'thinking_complete',
//         'thinking_failed',
//     ],
//     planning: ['thinking_complete', 'thinking_failed'],
//     replanning: [
//         'replan_analyzing',
//         'replan_preserving',
//         'replan_generating',
//         'replan_failed',
//     ],
//     analyzing: ['thinking_complete', 'thinking_failed'],
//     deciding: ['thinking_complete', 'thinking_failed'],
//     thinking_complete: ['acting', 'observing'],
//     thinking_failed: ['agent_error'],

//     // 🚀 ACT STATUS
//     acting: [
//         'tool_calling',
//         'plan_executing',
//         'waiting_response',
//         'acting_complete',
//         'acting_failed',
//     ],
//     tool_calling: ['waiting_response', 'acting_complete', 'acting_failed'],
//     plan_executing: ['step_executing', 'acting_complete', 'acting_failed'],
//     waiting_response: ['acting_complete', 'acting_failed'],
//     acting_complete: ['observing'],
//     acting_failed: ['observing'],

//     // 👁️ OBSERVE STATUS
//     observing: [
//         'evaluating',
//         'synthesizing',
//         'observing_complete',
//         'observing_failed',
//     ],
//     evaluating: ['synthesizing', 'observing_complete', 'observing_failed'],
//     synthesizing: ['observing_complete', 'observing_failed'],
//     observing_complete: ['thinking', 'agent_completed'],
//     observing_failed: ['agent_error'],

//     // 📋 PLAN STATUS
//     plan_created: ['plan_executing', 'plan_failed'],
//     plan_executing: [
//         'plan_completed',
//         'plan_failed',
//         'plan_paused',
//         'plan_waiting_input',
//     ],
//     plan_paused: ['plan_executing', 'plan_cancelled'],
//     plan_completed: ['observing'],
//     plan_failed: ['replanning', 'agent_failed'],
//     plan_cancelled: ['agent_cancelled'],
//     plan_waiting_input: ['plan_executing', 'plan_cancelled'],
//     plan_replanning: ['plan_created', 'plan_failed'],

//     // 🔧 STEP STATUS
//     step_pending: ['step_executing', 'step_blocked', 'step_skipped'],
//     step_blocked: ['step_pending', 'step_cancelled'],
//     step_executing: ['step_completed', 'step_failed', 'step_retrying'],
//     step_completed: ['step_pending', 'acting_complete'],
//     step_failed: ['step_retrying', 'step_skipped', 'acting_failed'],
//     step_skipped: ['step_pending', 'acting_complete'],
//     step_cancelled: ['plan_cancelled'],
//     step_retrying: ['step_executing', 'step_failed'],

//     // 🎯 EXECUTION STATUS
//     execution_started: ['execution_running', 'execution_failed'],
//     execution_running: [
//         'execution_completed',
//         'execution_failed',
//         'execution_paused',
//         'execution_deadlock',
//     ],
//     execution_paused: ['execution_running', 'execution_cancelled'],
//     execution_completed: ['observing'],
//     execution_failed: ['replanning', 'agent_failed'],
//     execution_cancelled: ['agent_cancelled'],
//     execution_timeout: ['agent_timeout'],
//     execution_deadlock: ['agent_error'],
//     execution_waiting: ['execution_running', 'execution_cancelled'],

//     // 🔄 REPLAN STATUS
//     replan_triggered: ['replan_analyzing', 'replan_failed'],
//     replan_analyzing: ['replan_preserving', 'replan_failed'],
//     replan_preserving: ['replan_generating', 'replan_failed'],
//     replan_generating: ['replan_completed', 'replan_failed'],
//     replan_completed: ['planning'],
//     replan_failed: ['agent_failed'],
//     replan_limit_reached: ['agent_failed'],
//     replan_cancelled: ['agent_cancelled'],

//     // 🎯 AGENT OVERALL STATUS
//     agent_idle: ['agent_initializing', 'agent_ready'],
//     agent_initializing: ['agent_ready', 'agent_error'],
//     agent_ready: ['agent_running', 'agent_error'],
//     agent_running: [
//         'agent_completed',
//         'agent_failed',
//         'agent_error',
//         'agent_paused',
//         'agent_waiting_input',
//     ],
//     agent_paused: ['agent_running', 'agent_cancelled'],
//     agent_completed: [], // Estado final
//     agent_failed: [], // Estado final
//     agent_error: [], // Estado final
//     agent_timeout: [], // Estado final
//     agent_cancelled: [], // Estado final
//     agent_waiting_input: ['agent_running', 'agent_cancelled'],
//     agent_stagnated: ['agent_error'],

//     // 🚨 ERROR STATUS
//     error_tool_unavailable: ['agent_error'],
//     error_tool_failed: ['agent_error'],
//     error_invalid_input: ['agent_error'],
//     error_missing_parameters: ['agent_error'],
//     error_permission_denied: ['agent_error'],
//     error_rate_limit: ['agent_error'],
//     error_timeout: ['agent_timeout'],
//     error_network: ['agent_error'],
//     error_unknown: ['agent_error'],
//     error_llm_failed: ['agent_error'],
//     error_planning_failed: ['agent_error'],
//     error_execution_failed: ['agent_error'],

//     // 📊 SUCCESS STATUS
//     success_completed: ['agent_completed'],
//     success_partial: ['agent_completed'],
//     success_with_warnings: ['agent_completed'],
//     success_alternative: ['agent_completed'],
//     success_cached: ['agent_completed'],
//     success_optimized: ['agent_completed'],
// };

// // ═══════════════════════════════════════════════════════════════════════════════
// // 🔧 UTILITY FUNCTIONS
// // ═══════════════════════════════════════════════════════════════════════════════

// /**
//  * Verifica se uma transição de status é válida
//  */
// export function isValidStatusTransition(
//     from: AgentStatus,
//     to: AgentStatus,
// ): boolean {
//     const allowedTransitions = StatusTransitions[from] || [];
//     return allowedTransitions.includes(to);
// }

// /**
//  * Obtém o próximo status recomendado baseado no contexto
//  */
// export function getRecommendedNextStatus(
//     currentStatus: AgentStatus,
//     context: {
//         hasError?: boolean;
//         isComplete?: boolean;
//         shouldContinue?: boolean;
//         needsReplan?: boolean;
//     },
// ): AgentStatus | null {
//     const allowedTransitions = StatusTransitions[currentStatus] || [];

//     if (context.hasError) {
//         return (
//             allowedTransitions.find(
//                 (status) =>
//                     status.includes('failed') || status.includes('error'),
//             ) || null
//         );
//     }

//     if (context.isComplete) {
//         return (
//             allowedTransitions.find(
//                 (status) =>
//                     status.includes('complete') || status.includes('completed'),
//             ) || null
//         );
//     }

//     if (context.needsReplan) {
//         return (
//             allowedTransitions.find(
//                 (status) => status.includes('replan') || status === 'thinking',
//             ) || null
//         );
//     }

//     if (context.shouldContinue) {
//         return (
//             allowedTransitions.find(
//                 (status) =>
//                     status.includes('running') || status.includes('executing'),
//             ) || null
//         );
//     }

//     return null;
// }

// // ═══════════════════════════════════════════════════════════════════════════════
// // 🎯 TYPES NECESSÁRIOS
// // ═══════════════════════════════════════════════════════════════════════════════

// // Placeholder types - devem ser importados dos arquivos existentes
// export interface AgentAction {
//     type: string;
//     [key: string]: unknown;
// }

// export interface AgentThought {
//     reasoning: string;
//     action: AgentAction;
//     confidence: number;
// }
