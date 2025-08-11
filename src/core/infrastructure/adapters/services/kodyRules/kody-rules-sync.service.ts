import { Inject, Injectable } from '@nestjs/common';
import { OrganizationAndTeamData } from '@/config/types/general/organizationAndTeamData';
import { CodeManagementService } from '@/core/infrastructure/adapters/services/platformIntegration/codeManagement.service';
import { RULE_FILE_PATTERNS } from '@/shared/utils/kody-rules/file-patterns';
import { isFileMatchingGlob } from '@/shared/utils/glob-utils';
import { CreateOrUpdateKodyRulesUseCase } from '@/core/application/use-cases/kodyRules/create-or-update.use-case';
import {
    KodyRulesOrigin,
    KodyRulesScope,
} from '@/core/domain/kodyRules/interfaces/kodyRules.interface';
import {
    CreateKodyRuleDto,
    KodyRuleSeverity,
} from '@/core/infrastructure/http/dtos/create-kody-rule.dto';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import {
    PromptRunnerService,
    ParserType,
    PromptRole,
    LLMModelProvider,
} from '@kodus/kodus-common/llm';

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
    ) {}

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
            // obter detalhes da PR para extrair head/base refs (GitHub, GitLab, Bitbucket) e também suportar Azure via number
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
            // filtra pelos padrões usando picomatch (cobre ** corretamente e arquivos iniciados por ponto)
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
                    // Remoção: deixar para fluxo atual (exclusão/inativação já existente via UI/cron)
                    continue;
                }

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

                for (const rule of rules) {
                    const dto: CreateKodyRuleDto = {
                        uuid: rule.uuid,
                        title: rule.title,
                        rule: rule.rule,
                        path: rule.path ?? f.filename,
                        sourcePath: f.filename,
                        severity:
                            (rule.severity?.toLowerCase?.() as KodyRuleSeverity) ||
                            KodyRuleSeverity.MEDIUM,
                        repositoryId: repository.id,
                        origin: KodyRulesOrigin.USER,
                        status: rule.status,
                        scope:
                            (rule.scope as KodyRulesScope) ||
                            KodyRulesScope.FILE,
                        examples: Array.isArray(rule.examples)
                            ? rule.examples
                            : [],
                    } as CreateKodyRuleDto;

                    await this.upsertRule.execute(
                        dto,
                        organizationAndTeamData.organizationId,
                    );
                }
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
                    repository: repository.name,
                    organizationName:
                        repository.fullName?.split('/')?.[0] || '',
                    branch,
                    filePatterns: [...RULE_FILE_PATTERNS],
                    excludePatterns: [],
                });

            if (!files?.length) return;

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

                for (const rule of rules) {
                    const dto: CreateKodyRuleDto = {
                        uuid: rule.uuid,
                        title: rule.title,
                        rule: rule.rule,
                        path: rule.path ?? file.path,
                        sourcePath: file.path,
                        severity:
                            (rule.severity?.toLowerCase?.() as KodyRuleSeverity) ||
                            KodyRuleSeverity.MEDIUM,
                        repositoryId: repository.id,
                        origin: KodyRulesOrigin.USER,
                        status: rule.status,
                        scope:
                            (rule.scope as KodyRulesScope) ||
                            KodyRulesScope.FILE,
                        examples: Array.isArray(rule.examples)
                            ? rule.examples
                            : [],
                    } as CreateKodyRuleDto;

                    await this.upsertRule.execute(
                        dto,
                        organizationAndTeamData.organizationId,
                    );
                }
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
                    fallback: LLMModelProvider.NOVITA_QWEN3_235B_A22B_THINKING_2507,
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
                        'Convert repository rule files (Cursor, Claude, GitHub rules, coding standards, etc.) into a JSON array of Kody Rules.',
                        'Output ONLY a valid JSON array. If none, output []. No comments or explanations.',
                        'Each item MUST match exactly:',
                        '{"title": string, "rule": string, "path": string, "sourcePath": string, "severity": "low"|"medium"|"high"|"critical", "scope"?: "file"|"pull-request", "status"?: "active"|"pending"|"rejected"|"deleted", "examples": [{ "snippet": string, "isCorrect": boolean }]}',
                        'Detection: extract a rule only if the text imposes a requirement/restriction/convention/standard.',
                        'Severity map: must/required/security/blocker → "high" or "critical"; should/warn → "medium"; tip/info/optional → "low".',
                        'Scope: "file" for code/content; "pull-request" for PR titles/descriptions/commits/reviewers/labels.',
                        'Status: "active" if mandatory; "pending" if suggestive; "deleted" if deprecated.',
                        'path (target GLOB): use declared globs/paths when present (frontmatter like "globs:" or explicit sections). If none, set "**/*". If multiple, join with commas (e.g., "services/**,api/**").',
                        'sourcePath: ALWAYS set to the exact file path provided in input.',
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
                        prompt: 'Return ONLY the JSON array for the rules, without code fences. No explanations.',
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
