import { IPostHog, PostHog } from 'posthog-node';

import { IOrganization } from '@/core/domain/organization/interfaces/organization.interface';
import { ITeam } from '@/core/domain/team/interfaces/team.interface';
import { IUser } from '@/core/domain/user/interfaces/user.interface';

class PostHogClient {
    private readonly posthog: IPostHog | null = null;

    constructor() {
        const apiKey = process.env.API_POSTHOG_KEY;
        if (apiKey) {
            this.posthog = new PostHog(apiKey, {
                host: 'https://us.i.posthog.com',
            });
        } else {
            this.posthog = null;
        }
    }

    userIdentify(user: IUser): void {
        if (!this.posthog) return;

        const properties: any = {
            email: user.email,
            id: user.uuid,
        };

        if (user.organization) {
            properties.organizationId = user.organization.uuid;
            properties.organizationName = user.organization.name;
        }

        this.posthog.identify({
            distinctId: user.uuid,
            properties,
        });
        this.posthog.capture({
            distinctId: user.uuid,
            event: 'user_added_to_organization',
            properties,
            groups: {
                organization: user.organization?.uuid,
            },
        });
        this.posthog.shutdown();
    }

    organizationIdentify(organization: IOrganization): void {
        if (!this.posthog) return;

        this.posthog.groupIdentify({
            groupType: 'organization',
            groupKey: organization.uuid,
            properties: {
                name: organization.name,
                tenantName: organization.tenantName,
                id: organization.uuid,
            },
        });
        this.posthog.shutdown();
    }

    teamIdentify(team: ITeam): void {
        if (!this.posthog) return;

        const properties: any = {
            name: team.name,
            id: team.uuid,
        };

        if (team.organization) {
            properties.organizationId = team.organization.uuid;
            properties.organizationName = team.organization.name;
        }

        this.posthog.groupIdentify({
            groupType: 'team',
            groupKey: team.uuid,
            properties,
        });
        this.posthog.shutdown();
    }

    isFeatureEnabled(featureName: string, user: IUser): Promise<boolean> {
        if (!this.posthog) return Promise.resolve(true);

        return this.posthog.isFeatureEnabled(featureName, user.uuid, {
            groups: { organization: user.organization.uuid },
        });
    }
}

export default new PostHogClient();
