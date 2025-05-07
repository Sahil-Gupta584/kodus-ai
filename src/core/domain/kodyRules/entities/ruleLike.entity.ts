import { Entity } from '@/shared/domain/interfaces/entity';

export interface IRuleLike {
    uuid: string;
    ruleId: string;
    language: string;
    userId?: string;
    createdAt: Date;
    updatedAt: Date;
}

export class RuleLikeEntity implements Entity<IRuleLike> {
    private readonly _uuid: string;
    private readonly _ruleId: string;
    private readonly _language: string;
    private readonly _userId?: string;
    private readonly _createdAt: Date;
    private readonly _updatedAt: Date;

    constructor(props: IRuleLike) {
        this._uuid = props.uuid;
        this._ruleId = props.ruleId;
        this._language = props.language;
        this._userId = props.userId;
        this._createdAt = props.createdAt;
        this._updatedAt = props.updatedAt;
    }

    static create(props: IRuleLike): RuleLikeEntity {
        return new RuleLikeEntity(props);
    }

    toJson(): IRuleLike {
        return this.toObject();
    }

    toObject(): IRuleLike {
        return {
            uuid: this._uuid,
            ruleId: this._ruleId,
            language: this._language,
            userId: this._userId,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
        };
    }

    get uuid(): string {
        return this._uuid;
    }
    get ruleId(): string {
        return this._ruleId;
    }
    get language(): string {
        return this._language;
    }
    get userId(): string | undefined {
        return this._userId;
    }
    get createdAt(): Date {
        return this._createdAt;
    }
    get updatedAt(): Date {
        return this._updatedAt;
    }
}
