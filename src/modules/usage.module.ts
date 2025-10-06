import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LogModelInstance } from '@/core/infrastructure/adapters/repositories/mongoose/schema';
import { TokenUsageService } from '@/core/infrastructure/adapters/services/usage/tokenUsage.service';
import { TokenUsageController } from '@/core/infrastructure/http/controllers/tokenUsage.controller';
import { TokenUsageRepository } from '@/core/infrastructure/adapters/repositories/mongoose/tokenUsage.repository';
import { TOKEN_USAGE_REPOSITORY_TOKEN } from '@/core/domain/tokenUsage/contracts/tokenUsage.repository.contract';
import { TOKEN_USAGE_SERVICE_TOKEN } from '@/core/domain/tokenUsage/contracts/tokenUsage.service.contract';

@Module({
    imports: [MongooseModule.forFeature([LogModelInstance])],
    providers: [
        { provide: TOKEN_USAGE_SERVICE_TOKEN, useClass: TokenUsageService },
        {
            provide: TOKEN_USAGE_REPOSITORY_TOKEN,
            useClass: TokenUsageRepository,
        },
    ],
    controllers: [TokenUsageController],
    exports: [TOKEN_USAGE_SERVICE_TOKEN],
})
export class UsageModule {}
