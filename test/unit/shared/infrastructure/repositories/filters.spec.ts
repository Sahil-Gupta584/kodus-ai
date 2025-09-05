import { createNestedConditions } from '@/shared/infrastructure/repositories/filters';

describe('createNestedConditions', () => {
    it('should return empty object when filterObject is undefined', () => {
        const result = createNestedConditions('test', undefined);
        expect(result).toEqual({});
    });

    it('should return empty object when filterObject is null', () => {
        const result = createNestedConditions('test', null);
        expect(result).toEqual({});
    });

    it('should handle simple primitive values', () => {
        const filterObject = {
            name: 'test',
            age: 25,
            active: true,
        };

        const result = createNestedConditions('user', filterObject);

        expect(result).toEqual({
            'user.name': 'test',
            'user.age': 25,
            'user.active': true,
        });
    });

    it('should handle single-level nested objects', () => {
        const filterObject = {
            name: 'test',
            organization: {
                uuid: 'org-123',
                name: 'Test Org',
            },
        };

        const result = createNestedConditions('user', filterObject);

        expect(result).toEqual({
            'user.name': 'test',
            'user.organization.uuid': 'org-123',
            'user.organization.name': 'Test Org',
        });
    });

    it('should handle deeply nested objects (organization filtering case)', () => {
        const filterObject = {
            uuid: 'team-automation-id',
            team: {
                uuid: 'team-id',
                name: 'Test Team',
                organization: {
                    uuid: 'org-id',
                    name: 'Test Organization',
                },
            },
        };

        const result = createNestedConditions('teamAutomation', filterObject);

        expect(result).toEqual({
            'teamAutomation.uuid': 'team-automation-id',
            'teamAutomation.team.uuid': 'team-id',
            'teamAutomation.team.name': 'Test Team',
            'teamAutomation.team.organization.uuid': 'org-id',
            'teamAutomation.team.organization.name': 'Test Organization',
        });
    });

    it('should handle mixed primitive and nested values', () => {
        const filterObject = {
            status: 'active',
            pullRequestNumber: 123,
            teamAutomation: {
                team: {
                    organization: {
                        uuid: 'org-123',
                    },
                },
            },
        };

        const result = createNestedConditions('execution', filterObject);

        expect(result).toEqual({
            'execution.status': 'active',
            'execution.pullRequestNumber': 123,
            'execution.teamAutomation.team.organization.uuid': 'org-123',
        });
    });

    it('should handle arrays as primitive values', () => {
        const filterObject = {
            tags: ['tag1', 'tag2'],
            organization: {
                uuid: 'org-123',
            },
        };

        const result = createNestedConditions('automation', filterObject);

        expect(result).toEqual({
            'automation.tags': ['tag1', 'tag2'],
            'automation.organization.uuid': 'org-123',
        });
    });

    it('should handle null values in nested objects', () => {
        const filterObject = {
            name: 'test',
            organization: {
                uuid: 'org-123',
                description: null,
            },
        };

        const result = createNestedConditions('user', filterObject);

        expect(result).toEqual({
            'user.name': 'test',
            'user.organization.uuid': 'org-123',
            'user.organization.description': null,
        });
    });
});
