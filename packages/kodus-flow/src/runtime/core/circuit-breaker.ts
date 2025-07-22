/**
 * Circuit Breaker - Sistema de proteção contra falhas em cascata
 *
 * Implementa o padrão Circuit Breaker com três estados:
 * - CLOSED: Operação normal
 * - OPEN: Circuito aberto, falhas detectadas
 * - HALF_OPEN: Testando se o serviço se recuperou
 */

import type { ObservabilitySystem } from '../../observability/index.js';

/**
 * Estados do Circuit Breaker
 */
export enum CircuitState {
    CLOSED = 'CLOSED',
    OPEN = 'OPEN',
    HALF_OPEN = 'HALF_OPEN',
}

/**
 * Configuração do Circuit Breaker
 */
export interface CircuitBreakerConfig {
    /**
     * Nome do circuito (identificador único)
     */
    name: string;

    /**
     * Número de falhas consecutivas para abrir o circuito
     * @default 5
     */
    failureThreshold?: number;

    /**
     * Tempo em ms para tentar reabrir o circuito (half-open)
     * @default 60000 (1 minuto)
     */
    recoveryTimeout?: number;

    /**
     * Número de tentativas de sucesso para fechar o circuito
     * @default 3
     */
    successThreshold?: number;

    /**
     * Timeout para operações individuais
     * @default 60000 (60 segundos)
     */
    operationTimeout?: number;

    /**
     * Habilitar monitoramento
     * @default true
     */
    enabled?: boolean;

    /**
     * Callback para mudanças de estado
     */
    onStateChange?: (state: CircuitState, previousState: CircuitState) => void;

    /**
     * Callback para falhas
     */
    onFailure?: (error: Error, context?: unknown) => void;

    /**
     * Callback para sucessos
     */
    onSuccess?: (result: unknown, context?: unknown) => void;
}

/**
 * Métricas do Circuit Breaker
 */
export interface CircuitMetrics {
    /**
     * Estado atual
     */
    state: CircuitState;

    /**
     * Número total de chamadas
     */
    totalCalls: number;

    /**
     * Número de chamadas bem-sucedidas
     */
    successfulCalls: number;

    /**
     * Número de chamadas que falharam
     */
    failedCalls: number;

    /**
     * Número de chamadas rejeitadas (circuito aberto)
     */
    rejectedCalls: number;

    /**
     * Taxa de sucesso (0-1)
     */
    successRate: number;

    /**
     * Taxa de falha (0-1)
     */
    failureRate: number;

    /**
     * Última falha
     */
    lastFailure?: {
        timestamp: number;
        error: string;
    };

    /**
     * Último sucesso
     */
    lastSuccess?: {
        timestamp: number;
    };

    /**
     * Tempo desde a última mudança de estado
     */
    timeInCurrentState: number;

    /**
     * Próxima tentativa de reabertura (se aplicável)
     */
    nextAttempt?: number;
}

/**
 * Resultado de uma operação do Circuit Breaker
 */
export interface CircuitResult<T> {
    /**
     * Resultado da operação (se bem-sucedida)
     */
    result?: T;

    /**
     * Erro (se falhou)
     */
    error?: Error;

    /**
     * Estado do circuito após a operação
     */
    state: CircuitState;

    /**
     * Se a operação foi executada
     */
    executed: boolean;

    /**
     * Se foi rejeitada pelo circuito
     */
    rejected: boolean;

    /**
     * Duração da operação em ms
     */
    duration: number;
}

/**
 * Circuit Breaker
 */
export class CircuitBreaker {
    private config: Required<CircuitBreakerConfig>;
    private state: CircuitState = CircuitState.CLOSED;
    private failureCount = 0;
    private successCount = 0;
    private lastStateChange = Date.now();
    private lastFailure?: { timestamp: number; error: Error };
    private lastSuccess?: { timestamp: number };
    private nextAttempt?: number;
    private totalCalls = 0;
    private successfulCalls = 0;
    private failedCalls = 0;
    private rejectedCalls = 0;

    constructor(
        private observability: ObservabilitySystem,
        config: CircuitBreakerConfig,
    ) {
        this.config = {
            name: config.name,
            failureThreshold: config.failureThreshold ?? 5,
            recoveryTimeout: config.recoveryTimeout ?? 60000,
            successThreshold: config.successThreshold ?? 3,
            operationTimeout: config.operationTimeout ?? 60000, // ✅ UNIFIED: 60s timeout
            enabled: config.enabled ?? true,
            onStateChange: config.onStateChange ?? (() => {}),
            onFailure: config.onFailure ?? (() => {}),
            onSuccess: config.onSuccess ?? (() => {}),
        };
    }

    /**
     * Executar operação protegida pelo Circuit Breaker
     */
    async execute<T>(
        operation: () => Promise<T>,
        context?: unknown,
    ): Promise<CircuitResult<T>> {
        const startTime = Date.now();
        this.totalCalls++;

        // Verificar se o circuito está aberto
        if (this.state === CircuitState.OPEN) {
            if (this.shouldAttemptReset()) {
                this.transitionToHalfOpen();
            } else {
                this.rejectedCalls++;
                const result: CircuitResult<T> = {
                    state: this.state,
                    executed: false,
                    rejected: true,
                    duration: Date.now() - startTime,
                    error: new Error(
                        `Circuit breaker is OPEN for ${this.config.name}`,
                    ),
                };

                this.observability.logger.warn(
                    'Circuit breaker rejected operation',
                    {
                        circuit: this.config.name,
                        state: this.state,
                        nextAttempt: this.nextAttempt,
                    },
                );

                return result;
            }
        }

        // Executar operação com timeout
        try {
            const result = await this.executeWithTimeout(operation);
            this.handleSuccess(result, context);

            return {
                result,
                state: this.state,
                executed: true,
                rejected: false,
                duration: Date.now() - startTime,
            };
        } catch (error) {
            this.handleFailure(error as Error, context);

            return {
                error: error as Error,
                state: this.state,
                executed: true,
                rejected: false,
                duration: Date.now() - startTime,
            };
        }
    }

    /**
     * Executar operação com timeout
     */
    private async executeWithTimeout<T>(
        operation: () => Promise<T>,
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(
                    new Error(
                        `Operation timeout after ${this.config.operationTimeout}ms`,
                    ),
                );
            }, this.config.operationTimeout);

            operation()
                .then((result) => {
                    clearTimeout(timeout);
                    resolve(result);
                })
                .catch((error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
        });
    }

    /**
     * Tratar sucesso
     */
    private handleSuccess(result: unknown, context?: unknown): void {
        this.successfulCalls++;
        this.lastSuccess = { timestamp: Date.now() };

        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;
            if (this.successCount >= this.config.successThreshold) {
                this.transitionToClosed();
            }
        } else if (this.state === CircuitState.CLOSED) {
            // Reset failure count on success
            this.failureCount = 0;
        }

        if (this.config.onSuccess) {
            this.config.onSuccess(result, context);
        }

        this.observability.logger.debug('Circuit breaker operation succeeded', {
            circuit: this.config.name,
            state: this.state,
            successCount: this.successCount,
        });
    }

    /**
     * Tratar falha
     */
    private handleFailure(error: Error, context?: unknown): void {
        this.failedCalls++;
        this.lastFailure = { timestamp: Date.now(), error };

        if (this.state === CircuitState.CLOSED) {
            this.failureCount++;
            if (this.failureCount >= this.config.failureThreshold) {
                this.transitionToOpen();
            }
        } else if (this.state === CircuitState.HALF_OPEN) {
            // Qualquer falha em half-open volta para open
            this.transitionToOpen();
        }

        if (this.config.onFailure) {
            this.config.onFailure(error, context);
        }

        this.observability.logger.warn('Circuit breaker operation failed', {
            circuit: this.config.name,
            state: this.state,
            failureCount: this.failureCount,
            error: error.message,
        });
    }

    /**
     * Verificar se deve tentar reset
     */
    private shouldAttemptReset(): boolean {
        if (!this.nextAttempt) return false;
        return Date.now() >= this.nextAttempt;
    }

    /**
     * Transição para estado CLOSED
     */
    private transitionToClosed(): void {
        const previousState = this.state;
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.nextAttempt = undefined;
        this.lastStateChange = Date.now();

        if (this.config.onStateChange) {
            this.config.onStateChange(this.state, previousState);
        }

        this.observability.logger.info('Circuit breaker closed', {
            circuit: this.config.name,
            previousState,
        });
    }

    /**
     * Transição para estado OPEN
     */
    private transitionToOpen(): void {
        const previousState = this.state;
        this.state = CircuitState.OPEN;
        this.nextAttempt = Date.now() + this.config.recoveryTimeout;
        this.lastStateChange = Date.now();

        if (this.config.onStateChange) {
            this.config.onStateChange(this.state, previousState);
        }

        this.observability.logger.warn('Circuit breaker opened', {
            circuit: this.config.name,
            previousState,
            nextAttempt: this.nextAttempt,
        });
    }

    /**
     * Transição para estado HALF_OPEN
     */
    private transitionToHalfOpen(): void {
        const previousState = this.state;
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        this.lastStateChange = Date.now();

        if (this.config.onStateChange) {
            this.config.onStateChange(this.state, previousState);
        }

        this.observability.logger.info('Circuit breaker half-open', {
            circuit: this.config.name,
            previousState,
        });
    }

    /**
     * Forçar abertura do circuito
     */
    forceOpen(): void {
        if (this.state !== CircuitState.OPEN) {
            this.transitionToOpen();
        }
    }

    /**
     * Forçar fechamento do circuito
     */
    forceClose(): void {
        if (this.state !== CircuitState.CLOSED) {
            this.transitionToClosed();
        }
    }

    /**
     * Reset do circuito
     */
    reset(): void {
        this.transitionToClosed();
    }

    /**
     * Obter métricas do circuito
     */
    getMetrics(): CircuitMetrics {
        const now = Date.now();

        return {
            state: this.state,
            totalCalls: this.totalCalls,
            successfulCalls: this.successfulCalls,
            failedCalls: this.failedCalls,
            rejectedCalls: this.rejectedCalls,
            successRate:
                this.totalCalls > 0
                    ? this.successfulCalls / this.totalCalls
                    : 0,
            failureRate:
                this.totalCalls > 0 ? this.failedCalls / this.totalCalls : 0,
            lastFailure: this.lastFailure
                ? {
                      timestamp: this.lastFailure.timestamp,
                      error: this.lastFailure.error.message,
                  }
                : undefined,
            lastSuccess: this.lastSuccess,
            timeInCurrentState: now - this.lastStateChange,
            nextAttempt: this.nextAttempt,
        };
    }

    /**
     * Obter estado atual
     */
    getState(): CircuitState {
        return this.state;
    }

    /**
     * Verificar se está aberto
     */
    isOpen(): boolean {
        return this.state === CircuitState.OPEN;
    }

    /**
     * Verificar se está fechado
     */
    isClosed(): boolean {
        return this.state === CircuitState.CLOSED;
    }

    /**
     * Verificar se está meio aberto
     */
    isHalfOpen(): boolean {
        return this.state === CircuitState.HALF_OPEN;
    }
}
