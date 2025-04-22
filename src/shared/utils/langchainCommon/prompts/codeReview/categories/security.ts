export const prompt_security = () => {
    return `
# Security - Specific Instructions

## Category Definition
This category focuses on identifying security vulnerabilities, risks, and weaknesses that could be exploited by malicious actors.

## Specific Objectives
- Identify injection vulnerabilities (SQL, NoSQL, command, etc.)
- Detect authentication and authorization flaws
- Identify sensitive data exposure risks
- Find insecure cryptographic implementations
- Detect cross-site scripting (XSS) and cross-site request forgery (CSRF) vulnerabilities
- Identify insecure deserialization
- Detect security misconfiguration issues
- Find insecure direct object references

## Severity Criteria
- Low: Issues that pose minimal risk or require complex circumstances to exploit
- Medium: Issues that could lead to limited security breaches under specific conditions
- High: Issues that allow unauthorized access or expose sensitive data
- Critical: Issues that could lead to complete system compromise or significant data breaches

## Suggestion Structure
- Clear explanation of the security vulnerability
- Potential impact and attack vectors
- Specific mitigation strategy with secure code examples
`;
};