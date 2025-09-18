import { Global, Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ActivityLogController } from './activity-log.controller';
import { ActivityLogRepositoryProvider } from './activity-log.repository';
import { ActivityLogServiceProvider } from './activity-log.service';
import { ActivityLogModelInstance } from './schema/activity-log.model';
import { LicenseModule } from '@/ee/license/license.module';

@Global()
@Module({
    imports: [
        MongooseModule.forFeature([ActivityLogModelInstance]),
        forwardRef(() => LicenseModule),
    ],
    providers: [ActivityLogRepositoryProvider, ActivityLogServiceProvider],
    exports: [ActivityLogServiceProvider],
    controllers: [ActivityLogController],
})
export class ActivityLogModule {}
