import { LLM_PROVIDER_SERVICE_TOKEN } from '@/core/infrastructure/adapters/services/llmProviders/llmProvider.service.contract';
import { LLMProviderService } from '@/core/infrastructure/adapters/services/llmProviders/llmProvider.service';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
    providers: [
        LLMProviderService,
        {
            provide: LLM_PROVIDER_SERVICE_TOKEN,
            useClass: LLMProviderService,
        },
    ],
    exports: [LLM_PROVIDER_SERVICE_TOKEN, LLMProviderService],
})
export class LLMProviderModule {}
