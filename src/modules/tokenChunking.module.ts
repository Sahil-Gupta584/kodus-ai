import { Module } from '@nestjs/common';
import { TokenChunkingService } from '@/shared/utils/tokenChunking/tokenChunking.service';

@Module({
    providers: [TokenChunkingService],
    exports: [TokenChunkingService],
})
export class TokenChunkingModule {}
