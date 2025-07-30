/**
 * Schedule Middleware
 *
 * Implements interval-based triggers for scheduled events.
 * (Cron support will be added in future versions)
 */

/**
 * Schedule Middleware
 *
 * Implements interval-based triggers for scheduled events.
 * (Cron support will be added in future versions)
 */
import { IdGenerator } from '../../utils/id-generator.js';
import type { Event } from '../../core/types/events.js';

/**
 * Options for scheduling events
 */
export interface ScheduleOptions {
    /**
     * Interval in milliseconds between event triggers
     */
    intervalMs: number;

    /**
     * Maximum number of times to trigger the event (optional)
     * If not provided, the event will be triggered indefinitely
     */
    maxTriggers?: number;

    /**
     * Whether to trigger the event immediately upon registration
     * Default: false (wait for first interval)
     */
    triggerImmediately?: boolean;

    /**
     * Function to generate event data for each trigger
     * If not provided, the original event data will be used
     */
    generateData?: (triggerCount: number, originalEvent: Event) => unknown;
}

/**
 * Default schedule options
 */
const DEFAULT_SCHEDULE_OPTIONS: Partial<ScheduleOptions> = {
    triggerImmediately: false,
};

/**
 * Schedule middleware factory
 *
 * Creates a scheduled event emitter that triggers events at specified intervals.
 *
 * @param options - Schedule configuration options
 * @returns A function that sets up the schedule when called with a workflow context
 */
export function schedule(options: ScheduleOptions) {
    // Merge provided options with defaults
    const scheduleOptions: ScheduleOptions = {
        ...DEFAULT_SCHEDULE_OPTIONS,
        ...options,
    };

    // Return a function that sets up the schedule when called
    return function setupSchedule(
        event: Event,
        sendEvent: (event: Event) => void,
    ): () => void {
        let triggerCount = 0;
        let active = true;

        // Function to emit a scheduled event
        const triggerEvent = () => {
            if (!active) return;

            // Check if we've reached the maximum number of triggers
            if (
                scheduleOptions.maxTriggers !== undefined &&
                triggerCount >= scheduleOptions.maxTriggers
            ) {
                cleanup();
                return;
            }

            // Generate event data if a generator function is provided
            const eventData = scheduleOptions.generateData
                ? scheduleOptions.generateData(triggerCount, event)
                : event.data;

            // Create and send the scheduled event
            const scheduledEvent: Event = {
                id: IdGenerator.callId(),
                type: event.type,
                threadId: event.threadId,
                data: eventData,
                ts: Date.now(),
            };

            sendEvent(scheduledEvent);
            triggerCount++;
        };

        // Trigger immediately if specified
        if (scheduleOptions.triggerImmediately) {
            triggerEvent();
        }

        // Set up the interval
        const intervalId = setInterval(
            triggerEvent,
            scheduleOptions.intervalMs,
        );

        // Cleanup function to stop the schedule
        const cleanup = () => {
            if (intervalId) {
                clearInterval(intervalId);
                active = false;
            }
        };

        return cleanup;
    };
}
