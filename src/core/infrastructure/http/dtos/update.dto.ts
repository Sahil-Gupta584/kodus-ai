import {
    IsBoolean,
    IsEmail,
    IsEnum,
    IsOptional,
    IsString,
} from 'class-validator';
import { UserRole } from '@/core/domain/user/enums/userRole.enum';
import { STATUS } from '@/config/types/database/status.type';

export class UpdateUserDto {
    @IsString()
    @IsOptional()
    @IsEmail()
    email?: string;

    @IsString()
    @IsOptional()
    password?: string;

    @IsBoolean()
    @IsEnum(STATUS)
    status?: STATUS;

    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;
}
