export enum Action {
    Manage = 'manage', // wildcard for any action
    Create = 'create',
    Read = 'read',
    Update = 'update',
    Delete = 'delete',
}

export enum Role {
    OWNER = 'owner',
    BILLING_MANAGER = 'billing_manager',
    REPO_ADMIN = 'repo_admin',
    CONTRIBUTOR = 'contributor',
}
