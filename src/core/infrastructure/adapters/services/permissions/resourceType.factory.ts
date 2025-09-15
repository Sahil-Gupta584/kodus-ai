import { ResourceType } from '@/core/domain/permissions/enums/permissions.enum';
import {
    Resource,
    ResourceBilling,
    ResourceCockpit,
    ResourceIssues,
    ResourcePullRequests,
    ResourceCodeReviewSettings,
    Subject,
    ResourceGitSettings,
    ResourceLogs,
    ResourcePluginSettings,
    ResourceUserSettings,
    ResourceOrganizationSettings,
} from '@/core/domain/permissions/types/permissions.types';

const resourceMappings = [
    { type: ResourceType.PullRequests, subject: ResourcePullRequests },
    { type: ResourceType.Billing, subject: ResourceBilling },
    { type: ResourceType.Cockpit, subject: ResourceCockpit },
    { type: ResourceType.Issues, subject: ResourceIssues },
    {
        type: ResourceType.CodeReviewSettings,
        subject: ResourceCodeReviewSettings,
    },
    { type: ResourceType.GitSettings, subject: ResourceGitSettings },
    { type: ResourceType.UserSettings, subject: ResourceUserSettings },
    {
        type: ResourceType.OrganizationSettings,
        subject: ResourceOrganizationSettings,
    },
    { type: ResourceType.PluginSettings, subject: ResourcePluginSettings },
    { type: ResourceType.Logs, subject: ResourceLogs },
    { type: ResourceType.All, subject: Resource },
    { type: ResourceType.All, subject: 'all' as const },
] as const;

const typeToSubjectMap = new Map<ResourceType, Subject>(
    resourceMappings.map((m) => [m.type, m.subject]),
);

const subjectToTypeMap = new Map<Subject, ResourceType>(
    resourceMappings.map((m) => [m.subject, m.type]),
);

export class ResourceTypeFactory {
    static getTypeofResource(type: ResourceType): Subject {
        const resourceClass = typeToSubjectMap.get(type);
        if (!resourceClass) {
            throw new Error(`Unsupported resource type: ${type}`);
        }
        return resourceClass;
    }

    static getResourceTypeOfTypeofResource(resource: Subject): ResourceType {
        const resourceType = subjectToTypeMap.get(resource);
        if (!resourceType) {
            const constructor = (resource as any)?.constructor;
            const typeFromConstructor = subjectToTypeMap.get(constructor);
            if (typeFromConstructor) return typeFromConstructor;

            throw new Error(`Unsupported resource class: ${resource}`);
        }
        return resourceType;
    }
}
