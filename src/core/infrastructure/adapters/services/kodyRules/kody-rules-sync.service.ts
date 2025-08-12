import { Inject, Injectable } from '@nestjs/common';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { RULE_FILE_PATTERNS } from '@/shared/utils/kody-rules/file-patterns';
import { isFileMatchingGlob } from '@/shared/utils/glob-utils';
import { CreateOrUpdateKodyRulesUseCase } from '@/core/application/use-cases/kodyRules/create-or-update.use-case';
import {
    KodyRulesOrigin,
    KodyRulesScope,
    IKodyRule,
} from '@/core/domain/kodyRules/interfaces/kodyRules.interface';
import {
    CreateKodyRuleDto,
    KodyRuleSeverity,
} from '@/core/infrastructure/http/dtos/create-kody-rule.dto';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import {
    IKodyRulesService,
    KODY_RULES_SERVICE_TOKEN,
} from '@/core/domain/kodyRules/contracts/kodyRules.service.contract';
import {
    PromptRunnerService,
    ParserType,
    PromptRole,
    LLMModelProvider,
} from '@kodus/kodus-common/llm';
import { createHash } from 'crypto';

type SyncTarget = {
    organizationAndTeamData: OrganizationAndTeamData;
    repository: {
        id: string;
        name: string;
        fullName?: string;
        defaultBranch?: string;
    };
};

@Injectable()
export class KodyRulesSyncService {
    constructor(
        private readonly codeManagementService: CodeManagementService,
        private readonly promptRunner: PromptRunnerService,
        private readonly logger: PinoLoggerService,
        @Inject(CreateOrUpdateKodyRulesUseCase)
        private readonly upsertRule: CreateOrUpdateKodyRulesUseCase,
        @Inject(KODY_RULES_SERVICE_TOKEN)
        private readonly kodyRulesService: IKodyRulesService,
    ) {}

    private async findRuleBySourcePath(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repositoryId: string;
        sourcePath: string;
    }): Promise<Partial<{ uuid: string }> | null> {
        try {
            const { organizationAndTeamData, repositoryId, sourcePath } =
                params;
            const existing = await this.kodyRulesService.findByOrganizationId(
                organizationAndTeamData.organizationId,
            );
            const found = existing?.rules?.find(
                (r) =>
                    r?.repositoryId === repositoryId &&
                    r?.sourcePath === sourcePath,
            );
            return found ? { uuid: found.uuid } : null;
        } catch (error) {
            this.logger.error({
                message: 'Failed to find rule by sourcePath',
                context: KodyRulesSyncService.name,
                error,
                metadata: params,
            });
            return null;
        }
    }

    private async deleteRuleBySourcePath(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repositoryId: string;
        sourcePath: string;
    }): Promise<void> {
        try {
            const { organizationAndTeamData, repositoryId, sourcePath } =
                params;
            const entity = await this.kodyRulesService.findByOrganizationId(
                organizationAndTeamData.organizationId,
            );
            if (!entity) return;

            const toDelete = entity.rules?.find(
                (r) =>
                    r?.repositoryId === repositoryId &&
                    (r?.sourcePath || '').split('#')[0] === sourcePath,
            );
            if (!toDelete?.uuid) return;

            await this.kodyRulesService.deleteRuleLogically(
                entity.uuid,
                toDelete.uuid,
            );
        } catch (error) {
            this.logger.error({
                message: 'Failed to delete rule by sourcePath',
                context: KodyRulesSyncService.name,
                error,
                metadata: params,
            });
        }
    }

    private async findRulesBySourcePath(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repositoryId: string;
        sourcePath: string;
    }): Promise<Partial<IKodyRule>[]> {
        try {
            const { organizationAndTeamData, repositoryId, sourcePath } =
                params;
            const existing = await this.kodyRulesService.findByOrganizationId(
                organizationAndTeamData.organizationId,
            );
            return (
                existing?.rules?.filter(
                    (r) =>
                        r?.repositoryId === repositoryId &&
                        r?.sourcePath === sourcePath,
                ) || []
            );
        } catch (error) {
            this.logger.error({
                message: 'Failed to list rules by sourcePath',
                context: KodyRulesSyncService.name,
                error,
                metadata: params,
            });
            return [];
        }
    }

    private normalizeTitle(input?: string): string {
        return (input || '').trim().toLowerCase();
    }

    private normalizeRuleText(input?: string): string {
        if (!input) return '';
        return input
            .replace(/\r\n/g, '\n')
            .replace(/\t/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    private normalizeSnippet(input?: string): string {
        if (!input) return '';
        return input
            .replace(/\r\n/g, '\n')
            .replace(/[\s\u00A0]+/g, ' ')
            .trim()
            .toLowerCase();
    }

    private computeAnchorFromSnippet(snippet?: string): string | undefined {
        const norm = this.normalizeSnippet(snippet);
        if (!norm) return undefined;
        const hash = createHash('sha1').update(norm).digest('hex').slice(0, 16);
        return `s=${hash}`;
    }

    private extractAnchorFromSourcePath(
        sourcePath?: string,
    ): string | undefined {
        if (!sourcePath) return undefined;
        const idx = sourcePath.indexOf('#');
        if (idx < 0) return undefined;
        const suffix = sourcePath.slice(idx + 1);
        return suffix || undefined;
    }

    private matchExistingUuid(
        existing: Partial<IKodyRule>[],
        candidate: Pick<CreateKodyRuleDto, 'title' | 'rule' | 'path'> & {
            anchor?: string;
        },
    ): string | undefined {
        if (candidate.anchor) {
            const matchedByAnchor = existing.find((r) => {
                const a = this.extractAnchorFromSourcePath(r.sourcePath);
                return a && a === candidate.anchor;
            });
            if (matchedByAnchor?.uuid) return matchedByAnchor.uuid;
        }

        const title = this.normalizeTitle(candidate.title);
        const ruleText = this.normalizeRuleText(candidate.rule);

        const byTitle = existing.find(
            (r) => this.normalizeTitle(r.title) === title,
        );
        if (byTitle?.uuid) return byTitle.uuid;

        const byRule = existing.find(
            (r) => this.normalizeRuleText(r.rule) === ruleText,
        );
        if (byRule?.uuid) return byRule.uuid;

        if (candidate.path) {
            const byTitleAndPath = existing.find(
                (r) =>
                    this.normalizeTitle(r.title) === title &&
                    (r.path || '').toLowerCase() ===
                        (candidate.path || '').toLowerCase(),
            );
            if (byTitleAndPath?.uuid) return byTitleAndPath.uuid;
        }

        // Fuzzy fallback: Jaccard similarity over token sets of rule text
        const tokenize = (s: string) =>
            this.normalizeRuleText(s)
                .split(/[^a-z0-9]+/i)
                .filter(Boolean);
        const candTokens = new Set(tokenize(candidate.rule || ''));
        let best: { uuid?: string; score: number } = { score: 0 };
        for (const r of existing) {
            const exTokens = new Set(tokenize(r.rule || ''));
            const inter = new Set(
                [...candTokens].filter((t) => exTokens.has(t)),
            );
            const union = new Set([...candTokens, ...exTokens]);
            const score = union.size ? inter.size / union.size : 0;
            if (score > best.score) best = { uuid: r.uuid, score };
        }
        // Threshold tweakable; start conservative to avoid wrong merges
        if (best.uuid && best.score >= 0.6) return best.uuid;

        return undefined;
    }

    async syncFromChangedFiles(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { id: string; name: string; fullName?: string };
        pullRequestNumber: number;
        files: Array<{
            filename: string;
            previous_filename?: string;
            status: string;
        }>;
    }): Promise<void> {
        const {
            organizationAndTeamData,
            repository,
            pullRequestNumber,
            files,
        } = params;
        try {
            const prDetails =
                await this.codeManagementService.getPullRequestByNumber({
                    organizationAndTeamData,
                    repository: { id: repository.id, name: repository.name },
                    prNumber: pullRequestNumber,
                });

            const { head, base } = this.extractRefsFromPullRequest(prDetails);
            const pullRequestParam: any = {
                number: pullRequestNumber,
                head: head ? { ref: head } : undefined,
                base: base ? { ref: base } : undefined,
            };

            const patterns = [...RULE_FILE_PATTERNS];
            const isRuleFile = (fp?: string) =>
                !!fp && isFileMatchingGlob(fp, patterns);

            const ruleChanges = files.filter(
                (f) =>
                    isRuleFile(f.filename) || isRuleFile(f.previous_filename),
            );
            if (!ruleChanges.length) return;

            for (const f of ruleChanges) {
                if (f.status === 'removed') {
                    // Delete rule corresponding to removed file
                    await this.deleteRuleBySourcePath({
                        organizationAndTeamData,
                        repositoryId: repository.id,
                        sourcePath: f.filename,
                    });
                    continue;
                }

                const sourcePathLookup =
                    f.status === 'renamed' && f.previous_filename
                        ? f.previous_filename
                        : f.filename;

                const contentResp =
                    await this.codeManagementService.getRepositoryContentFile({
                        organizationAndTeamData,
                        repository: {
                            id: repository.id,
                            name: repository.name,
                        },
                        file: { filename: f.filename },
                        pullRequest: pullRequestParam,
                    });

                const rawContent = contentResp?.data?.content;
                if (!rawContent) continue;

                const decoded =
                    contentResp?.data?.encoding === 'base64'
                        ? Buffer.from(rawContent, 'base64').toString('utf-8')
                        : rawContent;

                const rules = await this.convertFileToKodyRules({
                    filePath: f.filename,
                    repositoryId: repository.id,
                    content: decoded,
                });

                if (!Array.isArray(rules) || rules.length === 0) {
                    this.logger.warn({
                        message: 'No rules parsed from changed file',
                        context: KodyRulesSyncService.name,
                        metadata: { file: f.filename },
                    });
                    continue;
                }

                const oneRule = rules.find(
                    (r) => r && typeof r === 'object' && r.title && r.rule,
                );

                if (!oneRule) continue;

                const existing = sourcePathLookup
                    ? await this.findRuleBySourcePath({
                          organizationAndTeamData,
                          repositoryId: repository.id,
                          sourcePath: sourcePathLookup,
                      })
                    : null;

                const dto: CreateKodyRuleDto = {
                    uuid: existing?.uuid,
                    title: oneRule.title as string,
                    rule: oneRule.rule as string,
                    path: (oneRule.path as string) ?? f.filename,
                    sourcePath: f.filename,
                    severity:
                        ((
                            oneRule.severity as any
                        )?.toLowerCase?.() as KodyRuleSeverity) ||
                        KodyRuleSeverity.MEDIUM,
                    repositoryId: repository.id,
                    origin: KodyRulesOrigin.USER,
                    status: oneRule.status as any,
                    scope:
                        (oneRule.scope as KodyRulesScope) ||
                        KodyRulesScope.FILE,
                    examples: Array.isArray(oneRule.examples)
                        ? (oneRule.examples as any)
                        : [],
                } as CreateKodyRuleDto;

                await this.upsertRule.execute(
                    dto,
                    organizationAndTeamData.organizationId,
                );
            }
        } catch (error) {
            this.logger.error({
                message: 'Failed to sync Kody Rules from changed files',
                context: KodyRulesSyncService.name,
                error,
                metadata: params,
            });
        }
    }

    async syncRepositoryMain(params: SyncTarget): Promise<void> {
        const { organizationAndTeamData, repository } = params;
        try {
            const branch = await this.codeManagementService.getDefaultBranch({
                organizationAndTeamData,
                repository,
            });

            // List only rule files
            const files =
                await this.codeManagementService.getRepositoryAllFiles({
                    organizationAndTeamData,
                    repository: { id: repository.id, name: repository.name },
                    filters: {
                        branch,
                        filePatterns: [...RULE_FILE_PATTERNS],
                    },
                });

            if (!files?.length) {
                // No rule files in main -> delete all existing repo rules
                const entity = await this.kodyRulesService.findByOrganizationId(
                    organizationAndTeamData.organizationId,
                );
                const repoRules = entity?.rules?.filter(
                    (r) => r?.repositoryId === repository.id,
                );
                for (const r of repoRules || []) {
                    if (!r?.uuid) continue;
                    await this.kodyRulesService.deleteRuleLogically(
                        entity!.uuid,
                        r.uuid,
                    );
                }
                return;
            }

            // Reconcile deletions: remove rules whose files no longer exist
            try {
                const currentPaths = new Set<string>(
                    files.map((f) => (f.path || '').split('#')[0]),
                );
                const entity = await this.kodyRulesService.findByOrganizationId(
                    organizationAndTeamData.organizationId,
                );
                const repoRules = entity?.rules?.filter(
                    (r) => r?.repositoryId === repository.id,
                );
                for (const r of repoRules || []) {
                    const basePath = (r?.sourcePath || '').split('#')[0];
                    if (!currentPaths.has(basePath) && r?.uuid) {
                        await this.kodyRulesService.deleteRuleLogically(
                            entity!.uuid,
                            r.uuid,
                        );
                    }
                }
            } catch (reconError) {
                this.logger.error({
                    message: 'Failed to reconcile deletions on main sync',
                    context: KodyRulesSyncService.name,
                    error: reconError,
                    metadata: params,
                });
            }

            for (const file of files) {
                const contentResp =
                    await this.codeManagementService.getRepositoryContentFile({
                        organizationAndTeamData,
                        repository: {
                            id: repository.id,
                            name: repository.name,
                        },
                        file: { filename: file.path },
                        pullRequest: {
                            head: { ref: branch },
                            base: { ref: branch },
                        },
                    });

                const rawContent = contentResp?.data?.content;
                if (!rawContent) continue;

                const decoded =
                    contentResp?.data?.encoding === 'base64'
                        ? Buffer.from(rawContent, 'base64').toString('utf-8')
                        : rawContent;

                const rules = await this.convertFileToKodyRules({
                    filePath: file.path,
                    repositoryId: repository.id,
                    content: decoded,
                });

                const oneRule = rules.find(
                    (r) => r && typeof r === 'object' && r.title && r.rule,
                );
                if (!oneRule) continue;

                const existing = await this.findRuleBySourcePath({
                    organizationAndTeamData,
                    repositoryId: repository.id,
                    sourcePath: file.path,
                });

                const dto: CreateKodyRuleDto = {
                    uuid: existing?.uuid,
                    title: oneRule.title as string,
                    rule: oneRule.rule as string,
                    path: (oneRule.path as string) ?? file.path,
                    sourcePath: file.path,
                    severity:
                        ((
                            oneRule.severity as any
                        )?.toLowerCase?.() as KodyRuleSeverity) ||
                        KodyRuleSeverity.MEDIUM,
                    repositoryId: repository.id,
                    origin: KodyRulesOrigin.USER,
                    status: oneRule.status as any,
                    scope:
                        (oneRule.scope as KodyRulesScope) ||
                        KodyRulesScope.FILE,
                    examples: Array.isArray(oneRule.examples)
                        ? (oneRule.examples as any)
                        : [],
                } as CreateKodyRuleDto;

                await this.upsertRule.execute(
                    dto,
                    organizationAndTeamData.organizationId,
                );
            }
        } catch (error) {
            this.logger.error({
                message: 'Failed to sync Kody Rules from main',
                context: KodyRulesSyncService.name,
                error,
                metadata: params,
            });
        }
    }

    private extractRefsFromPullRequest(pr: any): {
        head?: string;
        base?: string;
    } {
        const normalize = (ref?: string): string | undefined => {
            if (!ref) return undefined;
            return ref.startsWith('refs/heads/')
                ? ref.replace('refs/heads/', '')
                : ref;
        };

        const head = normalize(
            pr?.head?.ref || // GitHub
                pr?.source?.branch?.name || // Bitbucket
                pr?.sourceRefName || // Azure
                pr?.source_branch || // GitLab
                pr?.fromRef?.displayId, // Bitbucket Server
        );

        const base = normalize(
            pr?.base?.ref || // GitHub
                pr?.destination?.branch?.name || // Bitbucket
                pr?.targetRefName || // Azure
                pr?.target_branch || // GitLab
                pr?.toRef?.displayId, // Bitbucket Server
        );

        return { head, base };
    }

    private async convertFileToKodyRules(params: {
        filePath: string;
        repositoryId: string;
        content: string;
    }): Promise<Array<Partial<CreateKodyRuleDto>>> {
        try {
            const result = await this.promptRunner
                .builder()
                .setProviders({
                    main: LLMModelProvider.NOVITA_MOONSHOTAI_KIMI_K2_INSTRUCT,
                    fallback:
                        LLMModelProvider.NOVITA_QWEN3_235B_A22B_THINKING_2507,
                })
                .setParser<Array<Partial<CreateKodyRuleDto>>>(ParserType.JSON)
                .setLLMJsonMode(true)
                .setPayload({
                    filePath: params.filePath,
                    repositoryId: params.repositoryId,
                    content: params.content,
                })
                .addPrompt({
                    role: PromptRole.SYSTEM,
                    prompt: [
                        'Convert repository rule files (Cursor, Claude, GitHub rules, coding standards, etc.) into a JSON array of Kody Rules. IMPORTANT: Enforce exactly one rule per file. If multiple candidate rules exist, merge them concisely into one or pick the most representative. Return an array with a single item or [].',
                        'Output ONLY a valid JSON array. If none, output []. No comments or explanations.',
                        'Each item MUST match exactly:',
                        '{"title": string, "rule": string, "path": string, "sourcePath": string, "severity": "low"|"medium"|"high"|"critical", "scope"?: "file"|"pull-request", "status"?: "active"|"pending"|"rejected"|"deleted", "examples": [{ "snippet": string, "isCorrect": boolean }], "sourceSnippet"?: string}',
                        'Detection: extract a rule only if the text imposes a requirement/restriction/convention/standard.',
                        'Severity map: must/required/security/blocker → "high" or "critical"; should/warn → "medium"; tip/info/optional → "low".',
                        'Scope: "file" for code/content; "pull-request" for PR titles/descriptions/commits/reviewers/labels.',
                        'Status: "active" if mandatory; "pending" if suggestive; "deleted" if deprecated.',
                        'path (target GLOB): use declared globs/paths when present (frontmatter like "globs:" or explicit sections). If none, set "**/*". If multiple, join with commas (e.g., "services/**,api/**").',
                        'sourcePath: ALWAYS set to the exact file path provided in input.',
                        'sourceSnippet: when possible, include an EXACT copy (verbatim) of the bullet/line/paragraph from the file that led to this rule. Do NOT paraphrase. If none is suitable, omit this key.',
                        'Examples: prefer 1 incorrect and 1 correct (minimal snippets).',
                        'Language: keep the rule language consistent with the source (EN or PT-BR).',
                        'Do NOT include keys like repositoryId, origin, createdAt, updatedAt, uuid, or any extra keys.',
                        'Keep strings concise and strictly typed.',
                    ].join(' '),
                })
                .addPrompt({
                    role: PromptRole.USER,
                    prompt: `File: ${params.filePath}\n\nContent:\n${params.content}`,
                })
                .setRunName('kodyRulesFileToRules')
                .execute();

            if (!Array.isArray(result)) return [];

            return result.map((r) => ({
                ...r,
                severity:
                    (r?.severity?.toString?.().toLowerCase?.() as any) ||
                    KodyRuleSeverity.MEDIUM,
                scope: (r?.scope as any) || KodyRulesScope.FILE,
                path: r?.path || params.filePath,
                origin: KodyRulesOrigin.USER,
            }));
        } catch (error) {
            try {
                const raw = await this.promptRunner
                    .builder()
                    .setProviders({
                        main: LLMModelProvider.GEMINI_2_5_FLASH,
                        fallback: LLMModelProvider.GEMINI_2_5_PRO,
                    })
                    .setParser(ParserType.STRING)
                    .setPayload({
                        filePath: params.filePath,
                        repositoryId: params.repositoryId,
                        content: params.content,
                    })
                    .addPrompt({
                        role: PromptRole.SYSTEM,
                        prompt: 'Return ONLY the JSON array for the rules, without code fences. Include a "sourceSnippet" field when you can copy an exact excerpt from the file for each rule. No explanations.',
                    })
                    .addPrompt({
                        role: PromptRole.USER,
                        prompt: `File: ${params.filePath}\n\nContent:\n${params.content}`,
                    })
                    .setRunName('kodyRulesFileToRulesRaw')
                    .execute();

                const parsed = this.extractJsonArray(raw);
                if (!Array.isArray(parsed)) return [];

                return parsed.map((r) => ({
                    ...r,
                    severity:
                        (r?.severity?.toString?.().toLowerCase?.() as any) ||
                        KodyRuleSeverity.MEDIUM,
                    scope: (r?.scope as any) || KodyRulesScope.FILE,
                    path: r?.path || params.filePath,
                    sourcePath: r?.sourcePath || params.filePath,
                    origin: KodyRulesOrigin.USER,
                }));
            } catch (fallbackError) {
                this.logger.error({
                    message: 'LLM conversion failed for rule file',
                    context: KodyRulesSyncService.name,
                    metadata: params,
                    error: fallbackError,
                });
                return [];
            }
        }
    }

    private extractJsonArray(text: string | null | undefined): any[] | null {
        if (!text || typeof text !== 'string') return null;
        let s = text.trim();
        const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenceMatch && fenceMatch[1]) s = fenceMatch[1].trim();
        if (s.startsWith('"') && s.endsWith('"')) {
            try {
                s = JSON.parse(s);
            } catch {}
        }
        const start = s.indexOf('[');
        const end = s.lastIndexOf(']');
        if (start >= 0 && end > start) s = s.slice(start, end + 1);
        try {
            const parsed = JSON.parse(s);
            return Array.isArray(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }
}
