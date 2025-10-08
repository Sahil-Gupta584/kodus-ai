import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { getDefaultKodusConfigFile } from '@/shared/utils/validateCodeReviewConfigFile';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GetDefaultConfigUseCase {
    constructor(private readonly logger: PinoLoggerService) {}

    async execute() {
        try {
            return getDefaultKodusConfigFile();
        } catch (error) {
            this.logger.error({
                message: 'Error getting default Kodus config file',
                context: GetDefaultConfigUseCase.name,
                metadata: { error },
            });
            throw error;
        }
    }
}
