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

export type PromptFn<T> = (input?: T) => string;

export enum PromptRole {
    SYSTEM = 'system',
    USER = 'user',
    AI = 'ai',
}

export type RunPromptParams<T> = {
    payload?: T;
    provider: LLMModelProvider;
    fallbackProvider?: LLMModelProvider;
    systemPromptFn?: PromptFn<T>;
    userPromptFn?: PromptFn<T>;
    runName?: string;
    metadata?: Record<string, any>;
    temperature?: number;
    jsonMode?: boolean;
};

class PromptBuilder<OutputType, Payload = any> {
    private params: Partial<RunPromptParams<Payload>> = {};

    constructor(
        private readonly runner: PromptRunnerService,
        jsonMode: boolean,
        initialParams: Partial<RunPromptParams<any>> = {},
    ) {
        this.params = {
            jsonMode,
            temperature: 0,
            metadata: {},
            ...initialParams,
        };
    }

    /**
     * Adds a payload to the prompt configuration.
     * This payload will be used in the prompt functions defined in `addPrompt`.
     * @param payload The payload to be added.
     * @returns The PromptBuilder instance for chaining.
     */
    addPayload<P>(payload: P) {
        return new PromptBuilder<OutputType, P>(
            this.runner,
            this.params.jsonMode,
            {
                ...this.params,
                payload,
            },
        );
    }

    /**
     * Sets the main and optional fallback LLM providers.
     * @param config The configuration object containing the main and optional fallback providers.
     * - `main`: The main LLM provider to use.
     * - `fallback`: An optional fallback LLM provider.
     * @returns The PromptBuilder instance for chaining.
     */
    addProviders(config: {
        main: LLMModelProvider;
        fallback?: LLMModelProvider;
    }) {
        const { main, fallback } = config;

        this.params.provider = main;

        if (fallback) {
            this.params.fallbackProvider = fallback;
        }

        return this;
    }

    /**
     * Adds a system or user prompt to the configuration.
     * **Note:** The `payload` from the last `addPrompt` call will be used for the entire execution.
     * If adding multiple prompts (e.g., system and user), ensure they use the same payload object.
     * @param config The configuration object containing the role and prompt function.
     * - `role`: The role of the prompt (system or user).
     * - `prompt`: The function that generates the prompt content based on the payload.
     * @returns The PromptBuilder instance for chaining.
     */
    addPrompt(config: { role: PromptRole; prompt: PromptFn<Payload> }) {
        const { role, prompt } = config;

        if (role === PromptRole.SYSTEM) {
            this.params.systemPromptFn = prompt;
        } else if (role === PromptRole.USER) {
            this.params.userPromptFn = prompt;
        }

        return this;
    }

    /**
     * Adds metadata for logging and tracing.
     * @param metadata A record of key-value pairs.
     * @returns The PromptBuilder instance for chaining.
     */
    addMetadata(metadata: Record<string, any>) {
        this.params.metadata = { ...this.params.metadata, ...metadata };
        return this;
    }

    /**
     * Sets the temperature for the LLM. Defaults to 0.
     * @param temperature The creativity/randomness of the output.
     * @returns The PromptBuilder instance for chaining.
     */
    setTemperature(temperature: number) {
        this.params.temperature = temperature;
        return this;
    }

    /**
     * Sets a name for the run, useful for tracing.
     * @param runName The name of the run.
     * @returns The PromptBuilder instance for chaining.
     */
    setRunName(runName: string) {
        this.params.runName = runName;
        return this;
    }

    /**
     * Executes the prompt request with the configured parameters.
     * @returns A promise that resolves to the LLM response or null if an error occurs.
     */
    async execute(): Promise<OutputType | null> {
        if (!this.params.provider) {
            throw new Error(
                'LLM provider not set. Please call "addProviders()" before executing.',
            );
        }
        if (!this.params.systemPromptFn && !this.params.userPromptFn) {
            throw new Error(
                'No prompt function set. Please call "addPrompt()" before executing.',
            );
        }

        if (this.params.jsonMode) {
            return this.runner.runPrompt<Payload, OutputType>({
                ...this.params,
                provider: this.params.provider,
                jsonMode: true,
            });
        } else {
            const result = await this.runner.runPrompt<Payload>({
                ...this.params,
                provider: this.params.provider,
                jsonMode: false,
            });
            return result as OutputType;
        }
    }
}

@Injectable()
export class PromptRunnerService {
    constructor(
        @Inject('LLM_LOGGER')
        private readonly logger: LoggerService,

        private readonly llmProvider: LLMProviderService,
    ) {}

    jsonMode<JRES>() {
        return new PromptBuilder<JRES, void>(this, true);
    }

    stringMode() {
        return new PromptBuilder<string, void>(this, false);
    }

    async runPrompt<PLD, JRES>(
        params: RunPromptParams<PLD> & {
            jsonMode: true;
        },
    ): Promise<JRES | null>;

    async runPrompt<PLD>(
        params: Omit<RunPromptParams<PLD>, 'jsonMode'>,
    ): Promise<string | null>;

    async runPrompt<PLD>(
        params: RunPromptParams<PLD> & {
            jsonMode?: false | undefined;
        },
    ): Promise<string | null>;

    async runPrompt<PLD, JRES>(
        params: RunPromptParams<PLD>,
    ): Promise<JRES | string | null> {
        try {
            const chain = this.createChain<PLD, JRES>(params);

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

    createChain<PLD, JRES>(params: RunPromptParams<PLD>) {
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

            if (!mainChain) {
                throw new Error('Main chain could not be created');
            }

            if (!fallbackProvider) {
                return mainChain.withConfig({
                    runName,
                    metadata,
                });
            }

            const fallbackChain = this.createProviderChain<PLD, JRES>({
                provider: fallbackProvider,
                systemPromptFn: systemPromptFn,
                userPromptFn: userPromptFn,
                jsonMode,
                temperature,
            });

            if (!fallbackChain) {
                throw new Error('Fallback chain could not be created');
            }

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
                message: 'Error creating chain',
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

                type ResultType = {
                    role: PromptRole;
                    content: { type: 'text'; text: string }[];
                };

                const result: ResultType[] = [];

                if (systemPrompt) {
                    result.push({
                        role: PromptRole.SYSTEM,
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
                        role: PromptRole.USER,
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
