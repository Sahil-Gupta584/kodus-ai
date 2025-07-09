/**
 * @license
 * © Kodus Tech. All rights reserved.
 */

import { Injectable } from '@nestjs/common';
import {
    FileChange,
    ReviewModeResponse,
} from '@/config/types/general/codeReview.type';
import { PinoLoggerService } from '../logger/pino.service';
import { BaseFileReviewContextPreparation } from './base-file-review-context-preparation.service';
import { ReviewModeOptions } from '@/shared/interfaces/file-review-context-preparation.interface';

@Injectable()
export class FileReviewContextPreparation extends BaseFileReviewContextPreparation {
    constructor(protected readonly logger: PinoLoggerService) {
        super(logger);
    }

    protected async determineReviewMode(
        options?: ReviewModeOptions,
    ): Promise<ReviewModeResponse> {
        return ReviewModeResponse.LIGHT_MODE;
    }

    protected getRelevantFileContent(file: FileChange): Promise<string | null> {
        // In the standard version, we return the file content directly
        // without any additional processing
        return Promise.resolve(file.content || null);
    }
}
