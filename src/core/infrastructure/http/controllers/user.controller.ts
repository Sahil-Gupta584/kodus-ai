import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { GetUserUseCase } from '@/core/application/use-cases/user/get-user.use-case';
import { InviteDataUserUseCase } from '@/core/application/use-cases/user/invite-data.use-case';

import { AcceptUserInvitationDto } from '../dtos/accept-user-invitation.dto';
import { AcceptUserInvitationUseCase } from '@/core/application/use-cases/user/accept-user-invitation.use-case';
import { CheckUserWithEmailUserUseCase } from '@/core/application/use-cases/user/check-user-email.use-case';
import { IUser } from '@/core/domain/user/interfaces/user.interface';
import { UpdateUserUseCase } from '@/core/application/use-cases/user/update.use-case';
import { UpdateUserDto } from '../dtos/update.dto';
import { JoinOrganizationDto } from '../dtos/join-organization.dto';
import { JoinOrganizationUseCase } from '@/core/application/use-cases/user/join-organization.use-case';

@Controller('user')
export class UsersController {
    constructor(
        private readonly getUserUseCase: GetUserUseCase,
        private readonly inviteDataUserUseCase: InviteDataUserUseCase,
        private readonly acceptUserInvitationUseCase: AcceptUserInvitationUseCase,
        private readonly checkUserWithEmailUserUseCase: CheckUserWithEmailUserUseCase,
        private readonly joinOrganizationUseCase: JoinOrganizationUseCase,
    ) {}

    @Get('/email')
    public async getEmail(
        @Query('email')
        email: string,
    ) {
        return await this.checkUserWithEmailUserUseCase.execute(email);
    }

    @Get('/info')
    public async show() {
        return await this.getUserUseCase.execute();
    }

    @Get('/invite')
    public async getInviteDate(
        @Query('userId')
        userId: string,
    ) {
        return await this.inviteDataUserUseCase.execute(userId);
    }

    @Post('/invite/complete-invitation')
    public async completeInvitation(@Body() body: AcceptUserInvitationDto) {
        return await this.acceptUserInvitationUseCase.execute(body);
    }

    @Post('/join-organization')
    public async joinOrganization(@Body() body: JoinOrganizationDto) {
        return await this.joinOrganizationUseCase.execute(body);
    }
}
