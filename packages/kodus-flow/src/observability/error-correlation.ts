/**
 * Error Correlation Service - Tracking e análise de erros
 *
 * Funcionalidades:
 * - Error tracking com correlation IDs
 * - Pattern detection
 * - Root cause analysis
 * - Impact assessment
 */

import {
    EnhancedSDKError,
    StructuredErrorResponse,
} from '../core/enhanced-errors.js';
import { createLogger } from './logger.js';

export interface ErrorEvent {
    id: string;
    correlationId: string;
    error: StructuredErrorResponse;
    timestamp: number;
    component: string;
    tenantId: string;
    context: Record<string, unknown>;
}

export interface ErrorPattern {
    type:
        | 'frequency_spike'
        | 'cascade_failure'
        | 'component_degradation'
        | 'tenant_specific';
    description: string;
    affectedComponents: string[];
    errorCodes: string[];
    frequency: number;
    timeWindow: { start: number; end: number };
    severity: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;
}

export interface ErrorCorrelation {
    primaryError: ErrorEvent;
    relatedErrors: ErrorEvent[];
    correlationStrength: number;
    timeSpan: number;
    rootCause?: {
        component: string;
        description: string;
        confidence: number;
    };
}

export interface ErrorImpactAssessment {
    userImpact: {
        affectedUsers: number;
        affectedTenants: string[];
        severity: 'low' | 'medium' | 'high' | 'critical';
    };
    businessImpact: {
        affectedOperations: string[];
        estimatedDowntime: number;
        revenueImpact?: number;
    };
    systemImpact: {
        affectedComponents: string[];
        cascadeRisk: number;
        recoveryTimeEstimate: number;
    };
}

export class ErrorCorrelationService {
    private readonly logger = createLogger('error-correlation');

    // In-memory store (replace with persistent storage in production)
    private errorEvents = new Map<string, ErrorEvent>();
    private errorsByCorrelation = new Map<string, ErrorEvent[]>();
    private errorsByComponent = new Map<string, ErrorEvent[]>();
    private errorsByTenant = new Map<string, ErrorEvent[]>();

    // Configuration
    private readonly config = {
        maxErrorEvents: 10000,
        correlationWindow: 5 * 60 * 1000, // 5 minutes
        patternDetectionWindow: 15 * 60 * 1000, // 15 minutes
        cleanupInterval: 60 * 60 * 1000, // 1 hour
        minimumPatternFrequency: 3,
    };

    constructor() {
        this.setupCleanupTimer();
    }

    // ✅ TRACK ERROR EVENT
    async trackError(
        error: EnhancedSDKError,
        context: {
            component: string;
            tenantId: string;
            correlationId: string;
            requestId?: string;
            operationName?: string;
            additionalContext?: Record<string, unknown>;
        },
    ): Promise<ErrorEvent> {
        const errorEvent: ErrorEvent = {
            id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            correlationId: context.correlationId,
            error: error.toStructuredResponse({
                component: context.component,
                tenantId: context.tenantId,
                correlationId: context.correlationId,
                requestId: context.requestId,
            }),
            timestamp: Date.now(),
            component: context.component,
            tenantId: context.tenantId,
            context: {
                operationName: context.operationName,
                ...context.additionalContext,
            },
        };

        // Store error event
        this.storeErrorEvent(errorEvent);

        // Perform real-time analysis
        await this.performRealTimeAnalysis(errorEvent);

        // Log error event for tracking
        this.logger.info('Error tracked', {
            errorId: errorEvent.id,
            correlationId: errorEvent.correlationId,
            severity: errorEvent.error.error.severity,
            component: errorEvent.component,
            tenantId: errorEvent.tenantId,
        });

        return errorEvent;
    }

    // ✅ STORE ERROR EVENT
    private storeErrorEvent(errorEvent: ErrorEvent): void {
        // Store by ID
        this.errorEvents.set(errorEvent.id, errorEvent);

        // Index by correlation ID
        if (!this.errorsByCorrelation.has(errorEvent.correlationId)) {
            this.errorsByCorrelation.set(errorEvent.correlationId, []);
        }
        this.errorsByCorrelation
            .get(errorEvent.correlationId)!
            .push(errorEvent);

        // Index by component
        if (!this.errorsByComponent.has(errorEvent.component)) {
            this.errorsByComponent.set(errorEvent.component, []);
        }
        this.errorsByComponent.get(errorEvent.component)!.push(errorEvent);

        // Index by tenant
        if (!this.errorsByTenant.has(errorEvent.tenantId)) {
            this.errorsByTenant.set(errorEvent.tenantId, []);
        }
        this.errorsByTenant.get(errorEvent.tenantId)!.push(errorEvent);

        // Enforce size limits
        if (this.errorEvents.size > this.config.maxErrorEvents) {
            this.cleanupOldErrors();
        }
    }

    // ✅ REAL-TIME ANALYSIS
    private async performRealTimeAnalysis(
        errorEvent: ErrorEvent,
    ): Promise<void> {
        try {
            // Check for correlations
            const correlations = await this.findCorrelations(errorEvent);
            if (correlations.length > 0) {
                await this.handleCorrelatedErrors(errorEvent, correlations);
            }

            // Check for patterns
            const patterns = await this.detectPatterns(errorEvent);
            if (patterns.length > 0) {
                await this.handleDetectedPatterns(patterns);
            }

            // Assess impact
            const impact = await this.assessImpact(errorEvent);
            if (
                impact.userImpact.severity === 'critical' ||
                impact.systemImpact.cascadeRisk > 0.7
            ) {
                await this.handleCriticalImpact(errorEvent, impact);
            }
        } catch (analysisError) {
            this.logger.error(
                'Error during real-time analysis',
                analysisError as Error,
                {
                    errorEventId: errorEvent.id,
                    correlationId: errorEvent.correlationId,
                },
            );
        }
    }

    // ✅ FIND CORRELATIONS
    async findCorrelations(
        errorEvent: ErrorEvent,
    ): Promise<ErrorCorrelation[]> {
        const correlations: ErrorCorrelation[] = [];
        const now = errorEvent.timestamp;
        const windowStart = now - this.config.correlationWindow;

        // Find errors by correlation ID
        const relatedByCorrelation =
            this.errorsByCorrelation.get(errorEvent.correlationId) || [];
        const recentErrors = relatedByCorrelation.filter(
            (e) => e.timestamp >= windowStart && e.id !== errorEvent.id,
        );

        if (recentErrors.length > 0) {
            correlations.push({
                primaryError: errorEvent,
                relatedErrors: recentErrors,
                correlationStrength: 1.0, // Same correlation ID = highest strength
                timeSpan:
                    Math.max(...recentErrors.map((e) => e.timestamp)) -
                    Math.min(...recentErrors.map((e) => e.timestamp)),
                rootCause: await this.analyzeRootCause([
                    errorEvent,
                    ...recentErrors,
                ]),
            });
        }

        // Find errors by component proximity
        const componentErrors =
            this.errorsByComponent.get(errorEvent.component) || [];
        const recentComponentErrors = componentErrors.filter(
            (e) =>
                e.timestamp >= windowStart &&
                e.id !== errorEvent.id &&
                !recentErrors.some((re) => re.id === e.id),
        );

        if (recentComponentErrors.length >= 2) {
            correlations.push({
                primaryError: errorEvent,
                relatedErrors: recentComponentErrors,
                correlationStrength: 0.7, // Same component = medium strength
                timeSpan:
                    Math.max(...recentComponentErrors.map((e) => e.timestamp)) -
                    Math.min(...recentComponentErrors.map((e) => e.timestamp)),
            });
        }

        return correlations;
    }

    // ✅ PATTERN DETECTION
    async detectPatterns(errorEvent: ErrorEvent): Promise<ErrorPattern[]> {
        const patterns: ErrorPattern[] = [];
        const now = errorEvent.timestamp;
        const windowStart = now - this.config.patternDetectionWindow;

        // Get recent errors
        const recentErrors = Array.from(this.errorEvents.values()).filter(
            (e) => e.timestamp >= windowStart,
        );

        // Frequency spike detection
        const errorsByCode = new Map<string, ErrorEvent[]>();
        recentErrors.forEach((e) => {
            const code = e.error.error.code;
            if (!errorsByCode.has(code)) {
                errorsByCode.set(code, []);
            }
            errorsByCode.get(code)!.push(e);
        });

        errorsByCode.forEach((events, code) => {
            if (events.length >= this.config.minimumPatternFrequency) {
                const components = [...new Set(events.map((e) => e.component))];
                patterns.push({
                    type: 'frequency_spike',
                    description: `High frequency of ${code} errors detected`,
                    affectedComponents: components,
                    errorCodes: [code],
                    frequency: events.length,
                    timeWindow: { start: windowStart, end: now },
                    severity: this.calculatePatternSeverity(events),
                    confidence: Math.min(1.0, events.length / 10),
                });
            }
        });

        // Cascade failure detection
        const cascadePattern = this.detectCascadeFailure(recentErrors);
        if (cascadePattern) {
            patterns.push(cascadePattern);
        }

        return patterns;
    }

    // ✅ CASCADE FAILURE DETECTION
    private detectCascadeFailure(errors: ErrorEvent[]): ErrorPattern | null {
        // Sort by timestamp
        const sortedErrors = errors.sort((a, b) => a.timestamp - b.timestamp);

        // Look for error propagation patterns
        const componentSequence: string[] = [];
        const errorCodes: string[] = [];

        for (const error of sortedErrors) {
            if (!componentSequence.includes(error.component)) {
                componentSequence.push(error.component);
            }
            if (!errorCodes.includes(error.error.error.code)) {
                errorCodes.push(error.error.error.code);
            }
        }

        // If errors spread across multiple components in sequence
        if (componentSequence.length >= 3 && sortedErrors.length >= 5) {
            const firstError = sortedErrors[0];
            const lastError = sortedErrors[sortedErrors.length - 1];

            if (firstError && lastError) {
                return {
                    type: 'cascade_failure',
                    description: `Cascade failure detected across ${componentSequence.length} components`,
                    affectedComponents: componentSequence,
                    errorCodes,
                    frequency: sortedErrors.length,
                    timeWindow: {
                        start: firstError.timestamp,
                        end: lastError.timestamp,
                    },
                    severity: 'critical',
                    confidence: 0.8,
                };
            }
        }

        return null;
    }

    // ✅ ROOT CAUSE ANALYSIS
    private async analyzeRootCause(errors: ErrorEvent[]): Promise<
        | {
              component: string;
              description: string;
              confidence: number;
          }
        | undefined
    > {
        if (errors.length === 0) return undefined;

        // Find the earliest error
        const chronologicalErrors = errors.sort(
            (a, b) => a.timestamp - b.timestamp,
        );
        const firstError = chronologicalErrors[0];

        if (!firstError) return undefined;

        // Analyze error propagation
        const componentFrequency = new Map<string, number>();
        errors.forEach((e) => {
            componentFrequency.set(
                e.component,
                (componentFrequency.get(e.component) || 0) + 1,
            );
        });

        const mostAffectedComponent = Array.from(
            componentFrequency.entries(),
        ).sort((a, b) => b[1] - a[1])[0];

        if (!mostAffectedComponent) return undefined;

        return {
            component: firstError.component,
            description: `Initial failure in ${firstError.component}, propagated to ${mostAffectedComponent[0]}`,
            confidence: errors.length > 1 ? 0.8 : 0.6,
        };
    }

    // ✅ IMPACT ASSESSMENT
    async assessImpact(
        _errorEvent: ErrorEvent,
    ): Promise<ErrorImpactAssessment> {
        const recentErrors = Array.from(this.errorEvents.values()).filter(
            (e) => e.timestamp >= Date.now() - this.config.correlationWindow,
        );

        // User impact
        const affectedTenants = [
            ...new Set(recentErrors.map((e) => e.tenantId)),
        ];
        const errorSeverities = recentErrors.map((e) => e.error.error.severity);
        const maxSeverity = this.getMaxSeverity(errorSeverities);

        // System impact
        const affectedComponents = [
            ...new Set(recentErrors.map((e) => e.component)),
        ];
        const cascadeRisk = this.calculateCascadeRisk(recentErrors);

        return {
            userImpact: {
                affectedUsers: affectedTenants.length * 10, // Estimate 10 users per tenant
                affectedTenants: affectedTenants,
                severity: maxSeverity,
            },
            businessImpact: {
                affectedOperations: this.getAffectedOperations(recentErrors),
                estimatedDowntime: this.estimateDowntime(recentErrors),
            },
            systemImpact: {
                affectedComponents: affectedComponents,
                cascadeRisk: cascadeRisk,
                recoveryTimeEstimate: this.estimateRecoveryTime(recentErrors),
            },
        };
    }

    // ✅ HELPER METHODS
    private calculatePatternSeverity(
        events: ErrorEvent[],
    ): 'low' | 'medium' | 'high' | 'critical' {
        const severities = events.map((e) => e.error.error.severity);
        if (severities.includes('critical')) return 'critical';
        if (severities.includes('high')) return 'high';
        if (severities.includes('medium')) return 'medium';
        return 'low';
    }

    private getMaxSeverity(
        severities: string[],
    ): 'low' | 'medium' | 'high' | 'critical' {
        if (severities.includes('critical')) return 'critical';
        if (severities.includes('high')) return 'high';
        if (severities.includes('medium')) return 'medium';
        return 'low';
    }

    private calculateCascadeRisk(errors: ErrorEvent[]): number {
        const components = new Set(errors.map((e) => e.component));
        const timeSpan =
            Math.max(...errors.map((e) => e.timestamp)) -
            Math.min(...errors.map((e) => e.timestamp));

        // Risk increases with more components affected in shorter time
        return Math.min(
            1.0,
            components.size * 0.2 +
                errors.length * 0.1 -
                (timeSpan / 60000) * 0.01,
        );
    }

    private getAffectedOperations(errors: ErrorEvent[]): string[] {
        return [
            ...new Set(
                errors
                    .map((e) => e.context.operationName)
                    .filter(Boolean) as string[],
            ),
        ];
    }

    private estimateDowntime(errors: ErrorEvent[]): number {
        // Simple estimation based on error frequency and severity
        const criticalErrors = errors.filter(
            (e) => e.error.error.severity === 'critical',
        );
        return criticalErrors.length > 0 ? 300 : 60; // 5 minutes for critical, 1 minute otherwise
    }

    private estimateRecoveryTime(errors: ErrorEvent[]): number {
        // Estimate based on error types and component complexity
        const components = new Set(errors.map((e) => e.component));
        const baseTime = 120; // 2 minutes base
        const componentMultiplier = components.size * 30; // 30 seconds per component
        const errorMultiplier = errors.length * 10; // 10 seconds per error

        return baseTime + componentMultiplier + errorMultiplier;
    }

    // ✅ EVENT HANDLERS
    private async handleCorrelatedErrors(
        errorEvent: ErrorEvent,
        correlations: ErrorCorrelation[],
    ): Promise<void> {
        this.logger.warn('Correlated errors detected', {
            errorId: errorEvent.id,
            correlationCount: correlations.length,
            correlationId: errorEvent.correlationId,
        });

        // Log correlation event
        this.logger.warn('Error correlation detected', {
            primaryErrorId: errorEvent.id,
            correlationCount: correlations.length,
            components: correlations.flatMap((c) => [
                c.primaryError.component,
                ...c.relatedErrors.map((e) => e.component),
            ]),
            severity: this.getMaxSeverity(
                correlations.flatMap((c) => [
                    c.primaryError.error.error.severity,
                    ...c.relatedErrors.map((e) => e.error.error.severity),
                ]),
            ),
        });
    }

    private async handleDetectedPatterns(
        patterns: ErrorPattern[],
    ): Promise<void> {
        for (const pattern of patterns) {
            this.logger.warn('Error pattern detected', {
                type: pattern.type,
                description: pattern.description,
                severity: pattern.severity,
                confidence: pattern.confidence,
                affectedComponents: pattern.affectedComponents,
            });

            // Log pattern event
            this.logger.warn('Error pattern detected', {
                type: pattern.type,
                description: pattern.description,
                severity: pattern.severity,
                confidence: pattern.confidence,
                affectedComponents: pattern.affectedComponents,
            });
        }
    }

    private async handleCriticalImpact(
        errorEvent: ErrorEvent,
        impact: ErrorImpactAssessment,
    ): Promise<void> {
        this.logger.error(
            'Critical error impact detected',
            new Error('Critical impact detected'),
            {
                errorEventId: errorEvent.id,
                userImpact: impact.userImpact,
                systemImpact: impact.systemImpact,
                correlationId: errorEvent.correlationId,
            },
        );

        // Log critical impact alert
        this.logger.error(
            'Critical error impact detected',
            new Error('Critical impact detected'),
            {
                errorEventId: errorEvent.id,
                impact,
                alertLevel: 'critical',
            },
        );
    }

    // ✅ CLEANUP
    private setupCleanupTimer(): void {
        setInterval(() => {
            this.cleanupOldErrors();
        }, this.config.cleanupInterval);
    }

    private cleanupOldErrors(): void {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
        let cleaned = 0;

        for (const [id, event] of this.errorEvents.entries()) {
            if (event.timestamp < cutoff) {
                this.errorEvents.delete(id);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.logger.debug(`Cleaned up ${cleaned} old error events`);
        }
    }

    // ✅ PUBLIC API
    async getErrorById(id: string): Promise<ErrorEvent | undefined> {
        return this.errorEvents.get(id);
    }

    async getErrorsByCorrelationId(
        correlationId: string,
    ): Promise<ErrorEvent[]> {
        return this.errorsByCorrelation.get(correlationId) || [];
    }

    async getRecentPatterns(
        timeWindow: number = this.config.patternDetectionWindow,
    ): Promise<ErrorPattern[]> {
        const now = Date.now();
        const recentErrors = Array.from(this.errorEvents.values()).filter(
            (e) => e.timestamp >= now - timeWindow,
        );

        const patterns: ErrorPattern[] = [];

        // Detect current patterns
        for (const error of recentErrors.slice(-10)) {
            // Check last 10 errors
            const detectedPatterns = await this.detectPatterns(error);
            patterns.push(...detectedPatterns);
        }

        return patterns;
    }

    async getSystemHealthReport(): Promise<{
        totalErrors: number;
        errorsByComponent: Record<string, number>;
        errorsByTenant: Record<string, number>;
        recentPatterns: ErrorPattern[];
        averageResolutionTime: number;
    }> {
        const now = Date.now();
        const last24h = now - 24 * 60 * 60 * 1000;
        const recentErrors = Array.from(this.errorEvents.values()).filter(
            (e) => e.timestamp >= last24h,
        );

        const errorsByComponent: Record<string, number> = {};
        const errorsByTenant: Record<string, number> = {};

        recentErrors.forEach((error) => {
            errorsByComponent[error.component] =
                (errorsByComponent[error.component] || 0) + 1;
            errorsByTenant[error.tenantId] =
                (errorsByTenant[error.tenantId] || 0) + 1;
        });

        return {
            totalErrors: recentErrors.length,
            errorsByComponent,
            errorsByTenant,
            recentPatterns: await this.getRecentPatterns(),
            averageResolutionTime: this.estimateRecoveryTime(recentErrors),
        };
    }
}

// ✅ SINGLETON INSTANCE
let errorCorrelationService: ErrorCorrelationService | null = null;

export function getErrorCorrelationService(): ErrorCorrelationService {
    if (!errorCorrelationService) {
        errorCorrelationService = new ErrorCorrelationService();
    }
    return errorCorrelationService;
}
