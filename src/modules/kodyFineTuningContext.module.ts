import { forwardRef, Module } from '@nestjs/common';

import { CodebaseModule } from '@/modules/codeBase.module';
import { KodyFineTuningContextPreparationService } from '@/core/infrastructure/adapters/services/kodyFineTuning/fineTuningContext/fine-tuning.service';
import { KODY_FINE_TUNING_CONTEXT_PREPARATION_TOKEN } from '@/shared/interfaces/kody-fine-tuning-context-preparation.interface';

@Module({
    imports: [forwardRef(() => CodebaseModule)],
    providers: [
        {
            provide: KODY_FINE_TUNING_CONTEXT_PREPARATION_TOKEN,
            useClass: KodyFineTuningContextPreparationService,
        },
    ],
    exports: [KODY_FINE_TUNING_CONTEXT_PREPARATION_TOKEN],
})
export class KodyFineTuningContextModule {}
