import { IsArray, IsBoolean, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UserStatusDto {
    @IsString()
    public gitId: string;

    @IsString()
    public gitTool: string;

    @IsString()
    public licenseStatus: "active" | "inactive";

    @IsString()
    public teamId: string;

    @IsString()
    public organizationId: string;
}

export class UserStatusChangeDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UserStatusDto)
    public userStatusChanges: UserStatusDto[];
}
