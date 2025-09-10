import { PERMISSIONS_REPOSITORY_TOKEN } from '@/core/domain/permissions/contracts/permissions.repository.contract';
import { PERMISSIONS_SERVICE_TOKEN } from '@/core/domain/permissions/contracts/permissions.service.contract';
import { PermissionsRepository } from '@/core/infrastructure/adapters/repositories/typeorm/permissions.repository';
import { PermissionsModel } from '@/core/infrastructure/adapters/repositories/typeorm/schema/permissions.model';
import { PermissionsService } from '@/core/infrastructure/adapters/services/permissions/permissions.service';
import { PermissionsAbilityFactory } from '@/core/infrastructure/adapters/services/permissions/permissionsAbility.factory';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [TypeOrmModule.forFeature([PermissionsModel])],
    providers: [
        PermissionsAbilityFactory,
        {
            provide: PERMISSIONS_SERVICE_TOKEN,
            useClass: PermissionsService,
        },
        {
            provide: PERMISSIONS_REPOSITORY_TOKEN,
            useClass: PermissionsRepository,
        },
    ],
    controllers: [],
    exports: [PermissionsAbilityFactory, PERMISSIONS_SERVICE_TOKEN],
})
export class PermissionsModule {}
