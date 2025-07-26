import { MessageContentComplex } from '@langchain/core/messages';
import {
    BaseOutputParser,
    FormatInstructionsOptions,
    StringOutputParser,
    StructuredOutputParser,
} from '@langchain/core/output_parsers';
import { PromptRunnerService } from './promptRunner.service';
import z, { AnyZodObject } from 'zod';
import { LLMModelProvider } from './helper';
import { ParserType } from './builder';
import { tryParseJSONObject } from '@/utils/json';

export class CustomStringOutputParser extends StringOutputParser {
    protected _messageContentComplexToString(
        content: MessageContentComplex,
    ): string {
        if (content?.type === 'reasoning') {
            return '';
        }
        return super._messageContentComplexToString(content);
    }
}

export class ZodOutputParser<T extends AnyZodObject> extends BaseOutputParser {
    lc_namespace: string[] = [];

    constructor(
        private readonly config: {
            schema: T;
            promptRunnerService: PromptRunnerService;
            provider?: LLMModelProvider;
            fallbackProvider?: LLMModelProvider;
        },
    ) {
        super();
    }

    _baseMessageContentToString(content: MessageContentComplex[]): string {
        const noReasoningContent = content.filter(
            (c) => c.type !== 'reasoning',
        );
        const text = noReasoningContent.map((c) =>
            c.type === 'text' && c.text && typeof c.text === 'string'
                ? c.text
                : '',
        );
        return text.join('\n').trim();
    }

    getFormatInstructions(options?: FormatInstructionsOptions): string {
        const parser = StructuredOutputParser.fromZodSchema(
            this.config.schema as any,
        ) as BaseOutputParser<z.infer<T>>;

        return parser.getFormatInstructions(options);
    }

    /**
     * Parses the raw string output from the LLM.
     * It attempts to extract and parse JSON, and if it fails,
     * it uses another LLM call to correct the format.
     */
    async parse(text: string): Promise<z.infer<T>> {
        if (!text) {
            throw new Error('Input text is empty or undefined');
        }

        const parseJsonPreprocessor = (
            value: unknown,
            ctx: z.RefinementCtx,
        ): unknown => {
            if (typeof value === 'string') {
                try {
                    let cleanResponse = value;

                    if (value.startsWith('```')) {
                        cleanResponse = value
                            .replace(/^```json\n/, '')
                            .replace(/\n```(\n)?$/, '')
                            .trim();
                    }

                    const parsedResponse = tryParseJSONObject(cleanResponse);

                    if (parsedResponse) {
                        return parsedResponse;
                    }

                    throw new Error(
                        'Failed to parse JSON from the provided string',
                    );
                } catch {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: 'Invalid JSON string',
                    });
                    return z.NEVER;
                }
            }

            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Input must be a string',
            });
            return z.NEVER;
        };

        try {
            const preprocessorSchema = z.preprocess(
                parseJsonPreprocessor,
                this.config.schema,
            );

            return preprocessorSchema.parse(text);
        } catch {
            // If parsing fails, use the LLM to fix the JSON
            return this._runCorrectionChain(text);
        }
    }

    /**
     * Internal method to run a new prompt chain to fix malformed JSON.
     */
    private async _runCorrectionChain(
        malformedOutput: string,
    ): Promise<z.infer<T>> {
        if (!this.config.schema) {
            throw new Error('Schema is required for JSON correction');
        }

        if (!malformedOutput) {
            throw new Error('Malformed output is empty or undefined');
        }

        const correctionParser = StructuredOutputParser.fromZodSchema(
            this.config.schema as any,
        ) as BaseOutputParser<z.infer<T>>;

        const prompt = (input: string) =>
            `${input}\n\n${correctionParser.getFormatInstructions()}`;

        const result = await this.config.promptRunnerService
            .builder()
            .setProviders({
                main: this.config.provider || LLMModelProvider.OPENAI_GPT_4O,
                fallback:
                    this.config.fallbackProvider ||
                    LLMModelProvider.OPENAI_GPT_4O,
            })
            .setParser(ParserType.CUSTOM, correctionParser)
            .setPayload(malformedOutput)
            .addPrompt({ prompt })
            .setTemperature(0)
            .setLLMJsonMode(true)
            .setRunName('fixAndExtractJson')
            .execute();

        if (!result || !this.config.schema.safeParse(result).success) {
            throw new Error('Failed to correct JSON even after LLM fallback.');
        }

        return result;
    }
}
