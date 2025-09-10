import { AppAbility } from './permissions.types';

interface IPolicyHandler {
    handle(ability: AppAbility, request: any): boolean;
}

type PolicyHandlerCallback = (ability: AppAbility, request: any) => boolean;

export type PolicyHandler = IPolicyHandler | PolicyHandlerCallback;
