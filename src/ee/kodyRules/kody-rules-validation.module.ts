/**
 * @license
 * Kodus Tech. All rights reserved.
 */

import { forwardRef, Module } from '@nestjs/common';
import { KodyRulesValidationService } from './service/kody-rules-validation.service';
import { ByokModule } from '../byok/byok.module';

@Module({
    imports: [forwardRef(() => ByokModule)],
    providers: [KodyRulesValidationService],
    exports: [KodyRulesValidationService],
})
export class KodyRulesValidationModule {}
