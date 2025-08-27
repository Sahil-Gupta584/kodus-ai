import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { UserRole } from '@/core/domain/user/enums/userRole.enum';
import { STATUS } from '@/config/types/database/status.type';

export class UpdateAnotherUserDto {
    @IsBoolean()
    @IsEnum(STATUS)
    status?: STATUS;

    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;
}
