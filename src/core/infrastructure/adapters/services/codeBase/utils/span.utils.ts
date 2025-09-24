import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { getObservability } from '@kodus/flow';
import { Span } from '@kodus/flow/dist/observability';
import { TokenTrackingHandler } from '@kodus/kodus-common/llm';

export function newSpan(name: string) {
    const obs = getObservability();
    return obs.startSpan(name);
}

export function endSpan(
    tokenTracker: TokenTrackingHandler,
    metadata?: Record<string, any>,
    reset: boolean = true,
) {
    const obs = getObservability();
    const span = obs.getCurrentSpan();
    if (span) {
        obs.withSpan(span, () => {
            if (tokenTracker) {
                const tokenUsages = tokenTracker.getTokenUsages() as any;
                if (reset) {
                    tokenTracker.reset();
                }

                span.setAttributes({
                    tokenUsages,
                    ...(metadata || {}),
                });
            } else {
                span.setAttributes({ ...(metadata || {}) });
            }
        });
    }
}
