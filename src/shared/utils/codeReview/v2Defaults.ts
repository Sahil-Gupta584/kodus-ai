// Default guidance for Code Review v2 categories and severity (string-only).
// These strings are newline-separated to render easily in textareas.

export const V2_DEFAULT_CATEGORY_DESCRIPTIONS_TEXT = {
    bug: [
        'Execution breaks: Code throws unhandled exceptions',
        "Wrong results: Output doesn't match expected behavior",
        'Resource leaks: Unclosed files, connections, memory accumulation',
        'State corruption: Invalid object/data states',
        'Logic errors: Control flow produces incorrect outcomes',
        'Race conditions: Concurrent access causes inconsistent state or duplicates',
        "Incorrect measurements: Metrics/timings that don't reflect actual operations",
        'Invariant violations: Broken constraints (size limits, uniqueness, etc.)',
        'Async timing bugs: Variables captured incorrectly in async closures',
    ].join('\n'),
    performance: [
        'Algorithm complexity: O(n²) when O(n) is possible',
        'Redundant operations: Duplicate calculations or unnecessary loops',
        'Memory waste: Large allocations or leaks over time',
        'Blocking operations: Synchronous I/O in critical paths',
        'Database inefficiency: N+1, missing indexes, full scans',
        'Cache misses: Not leveraging available caching mechanisms',
    ].join('\n'),
    security: [
        'Injection vulnerabilities: SQL/NoSQL/command/LDAP injection',
        'AuthZ/AuthN flaws: Missing checks, privilege escalation',
        'Data exposure: Sensitive data in logs, responses, or errors',
        'Crypto issues: Weak algorithms, hardcoded keys, improper validation',
        'Input validation gaps: Missing sanitization or bounds checks',
        'Session management: Predictable tokens or missing expiration',
    ].join('\n'),
};

export const V2_DEFAULT_SEVERITY_FLAGS_TEXT = {
    critical: [
        'Application crash/downtime',
        'Data loss/corruption',
        'Security breach (unauthorized access/data exfiltration)',
        'Critical operation failure (auth/payment/authorization)',
        'Direct financial loss operations',
        'Memory leaks that inevitably crash production',
    ].join('\n'),
    high: [
        'Important functionality broken',
        'Memory leaks that cause eventual crash',
        'Performance degradation affecting UX under normal load',
        'Security issues with indirect exploitation paths',
        'Financial calculation errors affecting revenue',
    ].join('\n'),
    medium: [
        'Partially broken functionality',
        'Performance issues in specific scenarios',
        'Security weaknesses requiring specific conditions',
        'Incorrect but recoverable data',
        'Non-critical business logic errors with workarounds',
    ].join('\n'),
    low: [
        'Minor performance overhead',
        'Low-risk security improvements',
        'Incorrect metrics/logs',
        'Rarely affecting few users',
        'Edge-case issues',
    ].join('\n'),
};

export function getV2DefaultsText() {
    return {
        categories: { ...V2_DEFAULT_CATEGORY_DESCRIPTIONS_TEXT },
        severity: { ...V2_DEFAULT_SEVERITY_FLAGS_TEXT },
    };
}
