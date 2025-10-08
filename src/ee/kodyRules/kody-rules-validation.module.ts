/**
 * @license
 * Kodus Tech. All rights reserved.
 */

import { forwardRef, Module } from '@nestjs/common';
import { KodyRulesValidationService } from './service/kody-rules-validation.service';
import { PermissionValidationModule } from '../shared/permission-validation.module';

@Module({
    imports: [PermissionValidationModule],
    providers: [KodyRulesValidationService],
    exports: [KodyRulesValidationService],
})
export class KodyRulesValidationModule {}
