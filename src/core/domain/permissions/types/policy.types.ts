import { Type } from '@nestjs/common';
import { AppAbility, Subject } from './permissions.types';
import { Action } from '../enums/permissions.enum';

export interface IPolicyHandler {
    handle(ability: AppAbility, request?: any): boolean;
}

export type PolicyHandlerCallback = (
    ability: AppAbility,
    request?: any,
) => boolean;

export type PolicyHandler =
    | IPolicyHandler
    | PolicyHandlerCallback
    | Type<IPolicyHandler>;
