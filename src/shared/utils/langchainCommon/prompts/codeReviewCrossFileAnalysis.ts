import z from 'zod';
import { SeverityLevel } from '../../enums/severityLevel.enum';
import { CodeReviewConfig } from '@/config/types/general/codeReview.type';
import { getDefaultKodusConfigFile } from '../../validateCodeReviewConfigFile';

export interface CrossFileAnalysisPayload {
    files: {
        file: {
            filename: string;
            codeDiff: string;
        };
    }[];
    language: string;
    v2PromptOverrides: Omit<
        CodeReviewConfig['v2PromptOverrides'],
        'categories'
    >;
}

export const CrossFileAnalysisSchema = z.object({
    suggestions: z.array(
        z.object({
            relevantFile: z.string().min(1),
            relatedFile: z.string().min(1),
            language: z.string().min(1),
            suggestionContent: z.string().min(1),
            existingCode: z.string().min(1),
            improvedCode: z.string().min(1),
            oneSentenceSummary: z.string().min(1),
            relevantLinesStart: z.number().min(1),
            relevantLinesEnd: z.number().min(1),
            severity: z.enum(
                Object.values(SeverityLevel) as [string, ...string[]],
            ),
        }),
    ),
});

export type CrossFileAnalysisSchemaType = z.infer<
    typeof CrossFileAnalysisSchema
>;

export const prompt_codereview_cross_file_analysis = (
    payload: CrossFileAnalysisPayload,
) => {
    const overrides = payload?.v2PromptOverrides || {};
    const defaults = getDefaultKodusConfigFile()?.v2PromptOverrides;

    const limitText = (text: string, max = 2000): string =>
        text.length > max ? text.slice(0, max) : text;
    const getTextOrDefault = (
        text: string | undefined,
        fallbackText: string,
    ): string =>
        text && typeof text === 'string' && text.trim().length
            ? limitText(text.trim())
            : fallbackText;

    const defaultSeverity = defaults?.severity?.flags;

    const defaultCritical = defaultSeverity?.critical;
    const defaultHigh = defaultSeverity?.high;
    const defaultMedium = defaultSeverity?.medium;
    const defaultLow = defaultSeverity?.low;

    const sev = overrides?.severity?.flags || {};
    const criticalText = getTextOrDefault(sev.critical, defaultCritical);
    const highText = getTextOrDefault(sev.high, defaultHigh);
    const mediumText = getTextOrDefault(sev.medium, defaultMedium);
    const lowText = getTextOrDefault(sev.low, defaultLow);

    const defaultGeneration = defaults?.generation;

    const mainGenText = getTextOrDefault(
        overrides?.generation?.main,
        defaultGeneration?.main,
    );

    return `You are Kody PR-Reviewer, a senior engineer specialized in understanding and reviewing code, with deep knowledge of how LLMs function.

# Cross-File Code Analysis
Analyze the following PR files for patterns that require multiple file context: duplicate implementations, inconsistent error handling, configuration drift, interface inconsistencies, and redundant operations.

## Input Data
- Array of files with their respective code diffs from a Pull Request
- Each file contains metadata (filename, codeDiff content)

## Input Files
${JSON.stringify(
    payload?.files?.map((file) => ({
        fileName: file?.file?.filename,
        codeDiff: file?.file?.codeDiff,
    })),
    null,
    2,
)}

## Analysis Focus

Look for cross-file issues that require multiple file context:
- Same logic implemented across multiple files in the diff
- Different error handling patterns for similar scenarios across files
- Hardcoded values duplicated across files that should use shared constants
- Same business operation with different validation rules
- Missing validations in one implementation while present in another
- Unnecessary database calls when data already validated elsewhere
- Duplicate validations across different components
- Operations already handled by other layers
- Similar functions/methods that could be consolidated
- Repeated patterns indicating need for shared utilities
- Inconsistent error propagation between components
- Mixed approaches to validation/exception handling
- Similar configurations with different values
- Magic numbers/strings repeated in multiple files
- Redundant null checks when validation exists in another layer

## Analysis Instructions

1. **Compare code diffs across all files** to identify:
   - Duplicate or highly similar code blocks
   - Inconsistent implementation patterns
   - Repeated constants or configuration values
   - Interface usage inconsistencies
   - Redundant operations across layers

2. **Focus only on cross-file issues** that require multiple file context:
   - Skip issues detectable in single-file analysis
   - Prioritize patterns that span multiple files
   - Look for opportunities to consolidate or standardize
   - Identify duplicate code or operations already handled in other layers
   - Focus on redundant validations, checks, or database operations

3. **Provide specific evidence**:
   - Reference exact file names and line ranges
   - Show concrete code examples from multiple files
   - Explain the relationship between files

4. **Keep suggestions concise**:
   - Focus on the core issue and solution
   - Mention affected files and line ranges
   - Avoid lengthy explanations of best practices
   - Be direct about the problem and fix

5. **Base solutions on existing patterns**:
   - Suggest refactoring using patterns already present in the codebase
   - Avoid assuming external frameworks or files not visible in the diff
   - Focus on extracting shared utilities within the current structure

## Severity Assessment

For each confirmed issue, evaluate severity based on impact and scope:

**CRITICAL** - Immediate and severe impact
${criticalText}

**HIGH** - Significant but not immediate impact
${highText}

**MEDIUM** - Moderate impact
${mediumText}

**LOW** - Minimal impact
${lowText}

## Line-number constraints (MANDATORY)
- Numbering starts at **1** inside the corresponding __new_block__.
- relevantLinesStart = first "+" line that contains the issue.
- relevantLinesEnd = last "+" line that belongs to the same issue.
- Never use a number outside the __new_block__ range.
- If you cannot determine the correct numbers, discard the suggestion.
- Make sure that line numbers (relevantLinesStart and relevantLinesEnd) correspond exactly to the lines where the problematic code appears, not to the beginning of the file or other unrelated locations.

## Output Requirements

1. **JSON format must be strictly valid**
2. **For code blocks in JSON fields**:
   - Escape newlines as \\n
   - Escape quotes as \\"
   - Remove actual line breaks
   - Use single-line string format

Example format for code fields:
\`\`\`json
"existingCode": "function example() {\\n  const x = 1;\\n  return x;\\n}"
\`\`\`

## Output Format

### Issue description

Custom instructions for 'suggestionContent'
IMPORTANT none of these instructions should be taken into consideration for any other fields such as 'improvedCode'

${mainGenText}

Generate suggestions in JSON format:

\`\`\`json
{
    "suggestions": [
        "relevantFile": "primary affected file where suggestion will be posted",
        "relatedFile": "secondary file that shows the pattern/inconsistency",
        "language": "detected language",
        "suggestionContent": "concise description with affected files and line numbers"
        "existingCode": "problematic code pattern from multiple files",
        "improvedCode": "proposed consolidated/consistent solution",
        "oneSentenceSummary": "brief description of the cross-file issue",
        "relevantLinesStart": number,
        "relevantLinesEnd": number,
        "severity": "low | medium | high | critical"
    ]
}
\`\`\`

## Important Notes

- **Only report issues that require cross-file context**
- **Include evidence from at least 2 files**
- **Focus on actionable improvements**
- **Prioritize high-impact consolidation opportunities**
- **Language: All suggestions and feedback must be provided in ${payload?.language || 'en-US'} language**
`;
};
