/**
 * 🎯 AGENT STATUS SYSTEM
 *
 * Sistema completo de status para todas as situações possíveis do agent.
 * Organizado por categoria para facilitar manutenção e entendimento.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 🧠 THINK PHASE STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type ThinkStatus =
    | 'thinking' // Analisando input e contexto
    | 'planning' // Gerando plano de execução
    | 'replanning' // Replanejando após falha
    | 'analyzing' // Analisando resultado anterior
    | 'deciding' // Decidindo próxima ação
    | 'thinking_complete' // Pensamento concluído
    | 'thinking_failed'; // Falha no pensamento

// ═══════════════════════════════════════════════════════════════════════════════
// 🚀 ACT PHASE STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type ActStatus =
    | 'acting' // Executando ação
    | 'tool_calling' // Chamando ferramenta
    | 'plan_executing' // Executando plano
    | 'waiting_response' // Aguardando resposta da ferramenta
    | 'acting_complete' // Ação concluída com sucesso
    | 'acting_failed'; // Falha na execução

// ═══════════════════════════════════════════════════════════════════════════════
// 👁️ OBSERVE PHASE STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type ObserveStatus =
    | 'observing' // Analisando resultado
    | 'evaluating' // Avaliando sucesso/falha
    | 'synthesizing' // Sintetizando resposta final
    | 'observing_complete' // Observação concluída
    | 'observing_failed'; // Falha na observação

// ═══════════════════════════════════════════════════════════════════════════════
// 📋 PLAN STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type PlanStatus =
    | 'plan_created' // Plano criado
    | 'plan_executing' // Plano em execução
    | 'plan_paused' // Plano pausado
    | 'plan_completed' // Plano concluído com sucesso
    | 'plan_failed' // Plano falhou
    | 'plan_cancelled' // Plano cancelado
    | 'plan_waiting_input' // Plano aguardando input do usuário
    | 'plan_replanning'; // Plano sendo replanejado

// ═══════════════════════════════════════════════════════════════════════════════
// 🔧 STEP STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type StepStatus =
    | 'step_pending' // Step aguardando execução
    | 'step_blocked' // Step bloqueado por dependência
    | 'step_executing' // Step em execução
    | 'step_completed' // Step concluído com sucesso
    | 'step_failed' // Step falhou
    | 'step_skipped' // Step pulado
    | 'step_cancelled' // Step cancelado
    | 'step_retrying'; // Step sendo reexecutado

// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 EXECUTION STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type ExecutionStatus =
    | 'execution_started' // Execução iniciada
    | 'execution_running' // Execução em andamento
    | 'execution_paused' // Execução pausada
    | 'execution_completed' // Execução concluída com sucesso
    | 'execution_failed' // Execução falhou
    | 'execution_cancelled' // Execução cancelada
    | 'execution_timeout' // Execução expirou
    | 'execution_deadlock' // Execução em deadlock
    | 'execution_waiting'; // Execução aguardando

// ═══════════════════════════════════════════════════════════════════════════════
// 🔄 REPLAN STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type ReplanStatus =
    | 'replan_triggered' // Replan foi disparado
    | 'replan_analyzing' // Analisando falhas para replan
    | 'replan_preserving' // Preservando steps bem-sucedidos
    | 'replan_generating' // Gerando novo plano
    | 'replan_completed' // Replan concluído
    | 'replan_failed' // Replan falhou
    | 'replan_limit_reached' // Limite de replans atingido
    | 'replan_cancelled'; // Replan cancelado

// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 AGENT OVERALL STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type AgentOverallStatus =
    | 'agent_idle' // Agent ocioso
    | 'agent_initializing' // Agent inicializando
    | 'agent_ready' // Agent pronto para executar
    | 'agent_running' // Agent executando
    | 'agent_paused' // Agent pausado
    | 'agent_completed' // Agent concluído com sucesso
    | 'agent_failed' // Agent falhou
    | 'agent_error' // Agent em erro
    | 'agent_timeout' // Agent expirou
    | 'agent_cancelled' // Agent cancelado
    | 'agent_waiting_input' // Agent aguardando input
    | 'agent_stagnated'; // Agent estagnado

// ═══════════════════════════════════════════════════════════════════════════════
// 🚨 ERROR STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type ErrorStatus =
    | 'error_tool_unavailable' // Ferramenta não disponível
    | 'error_tool_failed' // Ferramenta falhou
    | 'error_invalid_input' // Input inválido
    | 'error_missing_parameters' // Parâmetros faltando
    | 'error_permission_denied' // Permissão negada
    | 'error_rate_limit' // Rate limit atingido
    | 'error_timeout' // Timeout
    | 'error_network' // Erro de rede
    | 'error_unknown' // Erro desconhecido
    | 'error_llm_failed' // LLM falhou
    | 'error_planning_failed' // Planejamento falhou
    | 'error_execution_failed'; // Execução falhou

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 SUCCESS STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type SuccessStatus =
    | 'success_completed' // Tarefa concluída com sucesso
    | 'success_partial' // Sucesso parcial
    | 'success_with_warnings' // Sucesso com avisos
    | 'success_alternative' // Sucesso com alternativa
    | 'success_cached' // Sucesso usando cache
    | 'success_optimized'; // Sucesso otimizado

// 🎯 UNIFIED STATUS SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Status unificado para o agent
 */
export type AgentStatus =
    | ThinkStatus
    | ActStatus
    | ObserveStatus
    | PlanStatus
    | StepStatus
    | ExecutionStatus
    | ReplanStatus
    | AgentOverallStatus
    | ErrorStatus
    | SuccessStatus;

/**
 * Status detalhado com contexto
 */
export interface DetailedAgentStatus {
    // Status principal
    status: AgentStatus;

    // Fase atual
    phase:
        | 'think'
        | 'act'
        | 'observe'
        | 'plan'
        | 'execute'
        | 'replan'
        | 'error'
        | 'success';

    // Contexto adicional
    context?: {
        currentStep?: number;
        totalSteps?: number;
        progress?: number; // 0-100
        iteration?: number;
        maxIterations?: number;
        elapsedTime?: number;
        estimatedTimeRemaining?: number;
        errorMessage?: string;
        successMessage?: string;
        warnings?: string[];
        suggestions?: string[];
    };

    // Timestamps
    timestamp: number;
    phaseStartTime?: number;

    // Metadata
    metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔧 UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verifica se o status indica sucesso
 */
export function isSuccessStatus(status: AgentStatus): boolean {
    return (
        status.startsWith('success_') ||
        status === 'agent_completed' ||
        status === 'execution_completed' ||
        status === 'plan_completed' ||
        status === 'step_completed' ||
        status === 'acting_complete' ||
        status === 'observing_complete' ||
        status === 'thinking_complete'
    );
}

/**
 * Verifica se o status indica erro
 */
export function isErrorStatus(status: AgentStatus): boolean {
    return (
        status.startsWith('error_') ||
        status === 'agent_failed' ||
        status === 'agent_error' ||
        status === 'execution_failed' ||
        status === 'plan_failed' ||
        status === 'step_failed' ||
        status === 'acting_failed' ||
        status === 'observing_failed' ||
        status === 'thinking_failed'
    );
}

/**
 * Verifica se o status indica que está em execução
 */
export function isRunningStatus(status: AgentStatus): boolean {
    return (
        status === 'agent_running' ||
        status === 'execution_running' ||
        status === 'plan_executing' ||
        status === 'step_executing' ||
        status === 'acting' ||
        status === 'observing' ||
        status === 'thinking'
    );
}

/**
 * Verifica se o status indica que está aguardando
 */
export function isWaitingStatus(status: AgentStatus): boolean {
    return (
        status === 'agent_waiting_input' ||
        status === 'execution_waiting' ||
        status === 'plan_waiting_input' ||
        status === 'step_pending' ||
        status === 'waiting_response'
    );
}

/**
 * Verifica se o status indica que está completo
 */
export function isCompleteStatus(status: AgentStatus): boolean {
    return (
        isSuccessStatus(status) ||
        isErrorStatus(status) ||
        status === 'agent_cancelled' ||
        status === 'execution_cancelled' ||
        status === 'plan_cancelled' ||
        status === 'step_cancelled'
    );
}
