import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { LLMProviderService } from './llmModelProvider.service';
import { LLMModelProvider } from './helper';
import {
    RunnableSequence,
    RunnableWithFallbacks,
} from '@langchain/core/runnables';
import {
    JsonOutputParser,
    StringOutputParser,
} from '@langchain/core/output_parsers';
import { handleError } from '../utils/error';

export type SystemPromptFn<T> = (input?: T) => string;
export type UserPromptFn<T> = (input?: T) => string;

export type RunPromptParams<T> = {
    payload: T;
    provider: LLMModelProvider;
    fallbackProvider: LLMModelProvider;
    systemPromptFn: SystemPromptFn<T>;
    userPromptFn: UserPromptFn<T>;
    runName?: string;
    metadata?: Record<string, any>;
    temperature?: number;
    jsonMode?: boolean;
};

@Injectable()
export class PromptRunnerService {
    constructor(
        @Inject('LLM_LOGGER')
        private readonly logger: LoggerService,

        private readonly llmProvider: LLMProviderService,
    ) {}

    async runPrompt<PLD, JRES>(
        params: RunPromptParams<PLD> & {
            jsonMode: true;
        },
    ): Promise<JRES | null>;

    async runPrompt<PLD, JRES = string>(
        params: RunPromptParams<PLD> & {
            jsonMode?: false;
        },
    ): Promise<JRES | null>;

    async runPrompt<PLD, JRES>(
        params: RunPromptParams<PLD>,
    ): Promise<JRES | string | null> {
        try {
            const chain = this.createChainWithFallback<PLD, JRES>(params);

            const response = await chain.invoke(params.payload);

            return response;
        } catch (error) {
            this.logger.error({
                message: `Error running prompt: ${params.runName}`,
                error: handleError(error),
                context: PromptRunnerService.name,
                metadata: params,
            });
            return null;
        }
    }

    createChainWithFallback<PLD, JRES>(params: RunPromptParams<PLD>) {
        try {
            const {
                provider,
                fallbackProvider,
                systemPromptFn,
                userPromptFn,
                runName,
                metadata = {},
                jsonMode = false,
                temperature = 0,
            } = params;

            const mainChain = this.createProviderChain<PLD, JRES>({
                provider,
                systemPromptFn: systemPromptFn,
                userPromptFn: userPromptFn,
                jsonMode,
                temperature,
            });

            const fallbackChain = this.createProviderChain<PLD, JRES>({
                provider: fallbackProvider,
                systemPromptFn: systemPromptFn,
                userPromptFn: userPromptFn,
                jsonMode,
                temperature,
            });

            let withFallbacks:
                | RunnableWithFallbacks<PLD, JRES>
                | RunnableWithFallbacks<PLD, string>;
            if (jsonMode) {
                withFallbacks = (
                    mainChain as RunnableSequence<PLD, JRES>
                ).withFallbacks({
                    fallbacks: [fallbackChain as RunnableSequence<PLD, JRES>],
                });
            } else {
                withFallbacks = (
                    mainChain as RunnableSequence<PLD, string>
                ).withFallbacks({
                    fallbacks: [fallbackChain as RunnableSequence<PLD, string>],
                });
            }

            return withFallbacks.withConfig({
                runName,
                metadata,
            });
        } catch (error) {
            this.logger.error({
                message: 'Error creating chain with fallback',
                error: handleError(error),
                context: PromptRunnerService.name,
                metadata: params,
            });
            throw error;
        }
    }

    createProviderChain<PLD, JRES>(
        params: Omit<RunPromptParams<PLD>, 'payload' | 'fallbackProvider'>,
    ) {
        try {
            const {
                provider,
                systemPromptFn,
                userPromptFn,
                jsonMode = false,
                temperature = 0,
            } = params;

            const llm = this.llmProvider.getLLMProvider({
                model: provider,
                temperature,
                jsonMode,
            });

            const promptFn = (input: PLD) => {
                const systemPrompt = systemPromptFn
                    ? systemPromptFn(input)
                    : null;
                const humanPrompt = userPromptFn ? userPromptFn(input) : null;

                const result: {
                    role: 'system' | 'user';
                    content: { type: 'text'; text: string }[];
                }[] = [];
                if (systemPrompt) {
                    result.push({
                        role: 'system',
                        content: [
                            {
                                type: 'text',
                                text: systemPrompt,
                            },
                        ],
                    });
                }
                if (humanPrompt) {
                    result.push({
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: humanPrompt,
                            },
                        ],
                    });
                }

                if (result.length === 0) {
                    throw new Error('No prompt content provided');
                }

                return result;
            };

            let chain:
                | RunnableSequence<any, JRES>
                | RunnableSequence<any, string>;
            if (jsonMode) {
                chain = RunnableSequence.from([
                    promptFn,
                    llm,
                    new JsonOutputParser<JRES>(),
                ]);
            } else {
                chain = RunnableSequence.from([
                    promptFn,
                    llm,
                    new StringOutputParser(),
                ]);
            }

            return chain;
        } catch (error) {
            this.logger.error({
                message: 'Error creating provider chain',
                error: handleError(error),
                context: PromptRunnerService.name,
                metadata: params,
            });
            throw error;
        }
    }
}
