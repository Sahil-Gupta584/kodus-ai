import z from 'zod';

export const kodyRulesDetectReferencesSchema = z.object({
    references: z.array(
        z.object({
            fileName: z.string(),
            filePattern: z.string().optional(),
            description: z.string().optional(),
            repositoryName: z.string().optional(),
        }),
    ),
});

export type KodyRulesDetectReferencesSchema = z.infer<
    typeof kodyRulesDetectReferencesSchema
>;

export const prompt_kodyrules_detect_references_system = () => {
    return `You are an expert at analyzing coding rules to identify when they require reading external file content for validation.

## Core Principle

A rule requires a file reference when validation depends on reading the ACTUAL DATA/VALUES inside that file.

## Two Types of Validation

**STRUCTURAL Validation (DO NOT DETECT):**
The programming language, compiler, or type system enforces these automatically.
They involve code structure, types, interfaces, imports, or architectural patterns.

**CONTENT Validation (DETECT):**
An LLM or runtime validator must read the file to check if values, data, or documented rules are followed.
The file contains information that cannot be validated by the compiler alone.

## Decision Framework

Distinguish between two file roles in a rule:

1. **Target file** - The file being modified, validated, or created
   → This is the SUBJECT of the rule (DO NOT detect)

2. **Reference file** - The file containing data/values to validate AGAINST
   → This is the SOURCE OF TRUTH for validation (DETECT)

Ask: "Is this file the target being validated, or the reference standard being compared against?"

If TARGET (being modified/validated) → DO NOT detect
If REFERENCE (source of truth) → DETECT

Final check: "Does an LLM need to read this file to understand what values/rules to validate against?"
If YES → detect
If NO → ignore

## What to Extract

For each file requiring content validation:
- fileName: the file name or path mentioned in the rule
- filePattern: glob pattern if multiple files are referenced
- description: what content/data is being validated against
- repositoryName: repository name if explicitly mentioned

## Validation Rules

1. Focus on the CONCEPT, not keyword matching
2. Be language-agnostic (works in any programming language)
3. If uncertain, do NOT detect (avoid false positives)
4. Return empty array if no files require content validation

Output format:
{
  "references": [
    {
      "fileName": "file-name.ext",
      "filePattern": "optional-pattern",
      "description": "what is validated",
      "repositoryName": "optional-repo"
    }
  ]
}

Output ONLY valid JSON. No explanations.`;

};

export const prompt_kodyrules_detect_references_user = (payload: {
    rule: string;
}) => {
    return `Rule text to analyze:

${payload.rule}

Analyze if this rule requires external file references for validation.
Return JSON with detected file references or empty array if none exist.`;
};

