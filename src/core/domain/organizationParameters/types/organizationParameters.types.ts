export type OrganizationParametersAutoJoinConfig = {
    enabled: boolean;
    domains: string[];
};

export type OrganizationParametersByokConfig = {
    apiKey: string;
    provider: string;
    model: string;
    baseUrl?: string;
};