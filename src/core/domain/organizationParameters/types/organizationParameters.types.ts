export type OrganizationParametersAutoJoinConfig = {
    enabled: boolean;
    domains: string[];
};

export type OrganizationParametersByokConfig = {
    main: {
        apiKey: string;
        provider: string;
        model: string;
        baseUrl?: string;
    };
    fallback?: {
        apiKey: string;
        provider: string;
        model: string;
        baseUrl?: string;
    };
};
