/**
 * MCP Health Check Manager
 * Gerencia health checks para servidores MCP
 */

import type {
    MCPHealthCheck,
    MCPHealthCheckResult,
    MCPServerStatus,
    MCPCircuitBreaker,
    MCPRateLimiter,
} from './types.js';
import { createLogger } from '../../observability/index.js';

export class MCPHealthManager {
    private logger = createLogger('mcp-health-manager');
    private healthChecks = new Map<string, MCPHealthCheck>();
    private serverStatus = new Map<string, MCPServerStatus>();
    private circuitBreakers = new Map<string, MCPCircuitBreaker>();
    private rateLimiters = new Map<string, MCPRateLimiter>();
    private healthCheckIntervals = new Map<string, NodeJS.Timeout>();

    constructor() {
        this.logger.info('MCP Health Manager initialized');
    }

    /**
     * Adiciona health check para um servidor
     */
    addHealthCheck(serverName: string, config: MCPHealthCheck): void {
        this.healthChecks.set(serverName, config);
        this.serverStatus.set(serverName, this.createInitialStatus(serverName));
        this.circuitBreakers.set(
            serverName,
            this.createInitialCircuitBreaker(),
        );
        this.rateLimiters.set(serverName, this.createInitialRateLimiter());

        if (config.enabled) {
            this.startHealthCheck(serverName);
        }

        this.logger.info('Health check added', { serverName, config });
    }

    /**
     * Remove health check de um servidor
     */
    removeHealthCheck(serverName: string): void {
        this.stopHealthCheck(serverName);
        this.healthChecks.delete(serverName);
        this.serverStatus.delete(serverName);
        this.circuitBreakers.delete(serverName);
        this.rateLimiters.delete(serverName);

        this.logger.info('Health check removed', { serverName });
    }

    /**
     * Inicia health check para um servidor
     */
    private startHealthCheck(serverName: string): void {
        const config = this.healthChecks.get(serverName);
        if (!config) return;

        const interval = setInterval(async () => {
            await this.performHealthCheck(serverName);
        }, config.interval);

        this.healthCheckIntervals.set(serverName, interval);

        this.logger.info('Health check started', {
            serverName,
            interval: config.interval,
        });
    }

    /**
     * Para health check de um servidor
     */
    private stopHealthCheck(serverName: string): void {
        const interval = this.healthCheckIntervals.get(serverName);
        if (interval) {
            clearInterval(interval);
            this.healthCheckIntervals.delete(serverName);
        }
    }

    /**
     * Executa health check para um servidor
     */
    private async performHealthCheck(
        serverName: string,
    ): Promise<MCPHealthCheckResult> {
        const config = this.healthChecks.get(serverName);
        const status = this.serverStatus.get(serverName);
        const circuitBreaker = this.circuitBreakers.get(serverName);

        if (!config || !status || !circuitBreaker) {
            return {
                serverName,
                healthy: false,
                responseTime: 0,
                error: 'Server not configured',
                timestamp: Date.now(),
            };
        }

        const startTime = Date.now();
        let healthy = false;
        let error: string | undefined;

        try {
            // Simula health check (ping do servidor)
            await this.pingServer(serverName, config.timeout);
            healthy = true;
        } catch (err) {
            error = err instanceof Error ? err.message : String(err);
            this.recordFailure(serverName, error);
        }

        const responseTime = Date.now() - startTime;

        // Atualiza status do servidor
        status.connected = healthy;
        status.lastHealthCheck = Date.now();
        status.responseTime = responseTime;
        status.lastError = error;

        if (healthy) {
            this.recordSuccess(serverName, responseTime);
        }

        const result: MCPHealthCheckResult = {
            serverName,
            healthy,
            responseTime,
            error,
            timestamp: Date.now(),
        };

        this.logger.debug('Health check result', { result });

        return result;
    }

    /**
     * Faz ping real do servidor MCP
     */
    private async pingServer(
        serverName: string,
        timeout: number,
    ): Promise<void> {
        try {
            // Tenta fazer uma requisição HTTP para o servidor
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(`${serverName}/health`, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    contentType: 'application/json',
                },
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Health check failed: ${response.status}`);
            }

            // Verifica se a resposta é válida
            const data = (await response.json()) as { healthy: boolean };
            if (!data.healthy) {
                throw new Error('Server reported unhealthy status');
            }
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('Health check timeout');
            }
            throw error;
        }
    }

    /**
     * Registra falha no circuit breaker
     */
    private recordFailure(serverName: string, error: string): void {
        const circuitBreaker = this.circuitBreakers.get(serverName);
        const status = this.serverStatus.get(serverName);

        if (!circuitBreaker || !status) return;

        circuitBreaker.failureCount++;
        circuitBreaker.lastFailureTime = Date.now();

        status.metrics.requestsFailed++;
        status.lastError = error;

        // Verifica se deve abrir circuit breaker
        if (circuitBreaker.failureCount >= circuitBreaker.failureThreshold) {
            circuitBreaker.state = 'open';
            this.logger.warn('Circuit breaker opened', {
                serverName,
                failureCount: circuitBreaker.failureCount,
            });
        }

        // Agenda reset do circuit breaker
        setTimeout(() => {
            this.resetCircuitBreaker(serverName);
        }, circuitBreaker.resetTimeout);
    }

    /**
     * Registra sucesso no circuit breaker
     */
    private recordSuccess(serverName: string, responseTime: number): void {
        const circuitBreaker = this.circuitBreakers.get(serverName);
        const status = this.serverStatus.get(serverName);

        if (!circuitBreaker || !status) return;

        // Reset circuit breaker
        circuitBreaker.failureCount = 0;
        circuitBreaker.state = 'closed';

        // Atualiza métricas
        status.metrics.requestsSuccessful++;
        status.metrics.averageResponseTime =
            (status.metrics.averageResponseTime + responseTime) / 2;
    }

    /**
     * Reseta circuit breaker
     */
    private resetCircuitBreaker(serverName: string): void {
        const circuitBreaker = this.circuitBreakers.get(serverName);
        if (!circuitBreaker) return;

        if (circuitBreaker.state === 'open') {
            circuitBreaker.state = 'half-open';
            this.logger.info('Circuit breaker reset to half-open', {
                serverName,
            });
        }
    }

    /**
     * Verifica se servidor está saudável
     */
    isServerHealthy(serverName: string): boolean {
        const status = this.serverStatus.get(serverName);
        const circuitBreaker = this.circuitBreakers.get(serverName);

        if (!status || !circuitBreaker) {
            return false;
        }

        // Servidor deve estar conectado e circuit breaker fechado
        return status.connected && circuitBreaker.state === 'closed';
    }

    /**
     * Verifica rate limit
     */
    checkRateLimit(serverName: string): boolean {
        const rateLimiter = this.rateLimiters.get(serverName);
        if (!rateLimiter) return true;

        const now = Date.now();
        const timeSinceReset = now - rateLimiter.lastResetTime;

        // Reset contador se passou da janela
        if (timeSinceReset >= rateLimiter.windowMs) {
            rateLimiter.currentRequests = 0;
            rateLimiter.lastResetTime = now;
        }

        // Verifica se pode fazer request
        if (rateLimiter.currentRequests >= rateLimiter.requestsPerMinute) {
            return false;
        }

        rateLimiter.currentRequests++;
        return true;
    }

    /**
     * Obtém status de todos os servidores
     */
    getServerStatuses(): Map<string, MCPServerStatus> {
        return new Map(this.serverStatus);
    }

    /**
     * Obtém status de um servidor específico
     */
    getServerStatus(serverName: string): MCPServerStatus | undefined {
        return this.serverStatus.get(serverName);
    }

    /**
     * Cria status inicial do servidor
     */
    private createInitialStatus(serverName: string): MCPServerStatus {
        return {
            name: serverName,
            connected: false,
            lastHealthCheck: 0,
            responseTime: 0,
            uptime: 0,
            metrics: {
                requestsTotal: 0,
                requestsSuccessful: 0,
                requestsFailed: 0,
                averageResponseTime: 0,
            },
        };
    }

    /**
     * Cria circuit breaker inicial
     */
    private createInitialCircuitBreaker(): MCPCircuitBreaker {
        return {
            failureThreshold: 5,
            resetTimeout: 60000, // 60s
            state: 'closed',
            failureCount: 0,
            lastFailureTime: 0,
        };
    }

    /**
     * Cria rate limiter inicial
     */
    private createInitialRateLimiter(): MCPRateLimiter {
        return {
            requestsPerMinute: 100,
            burstSize: 10,
            windowMs: 60000, // 1 min
            currentRequests: 0,
            lastResetTime: Date.now(),
        };
    }

    /**
     * Limpa recursos
     */
    destroy(): void {
        for (const [serverName] of this.healthChecks) {
            this.stopHealthCheck(serverName);
        }

        this.healthChecks.clear();
        this.serverStatus.clear();
        this.circuitBreakers.clear();
        this.rateLimiters.clear();
        this.healthCheckIntervals.clear();

        this.logger.info('MCP Health Manager destroyed');
    }
}
