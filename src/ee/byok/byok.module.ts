import { forwardRef, Module } from '@nestjs/common';
import { ValidateLicenseService } from './validateLicense.service';
import { LicenseModule } from '../license/license.module';
import { OrganizationParametersModule } from '@/modules/organizationParameters.module';

@Module({
    imports: [
        forwardRef(() => LicenseModule),
        forwardRef(() => OrganizationParametersModule),
    ],
    providers: [ValidateLicenseService],
    exports: [ValidateLicenseService],
})
export class ByokModule {}
