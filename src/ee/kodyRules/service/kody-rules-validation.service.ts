/**
 * @license
 * Kodus Tech. All rights reserved.
 */

import {
    IKodyRule,
    KodyRulesStatus,
} from '@/core/domain/kodyRules/interfaces/kodyRules.interface';
import { environment } from '@/ee/configs/environment';
import { isFileMatchingGlob } from '@/shared/utils/glob-utils';
import { Injectable } from '@nestjs/common';

/**
 * Service for validating and ordering Kody Rules in cloud mode
 */
@Injectable()
export class KodyRulesValidationService {
    public readonly MAX_KODY_RULES = 10;
    public readonly isCloud: boolean;

    constructor() {
        this.isCloud = environment.API_CLOUD_MODE;
    }

    /**
     * Validates if the total number of rules is within the allowed limit.
     * @param totalRules Total number of rules.
     * @returns True if the number of rules is within the limit, false otherwise.
     */
    validateRulesLimit(totalRules: number): boolean {
        return this.isCloud ? true : totalRules <= this.MAX_KODY_RULES;
    }

    /**
     * Returns the error message for exceeded rules limit.
     * @param organizationId Organization identifier.
     * @returns Error message if limit exceeded, or empty string.
     */
    getExceededLimitErrorMessage(organizationId: string): string {
        return this.isCloud
            ? ''
            : `Maximum number of Kody Rules (${this.MAX_KODY_RULES}) reached for organization ${organizationId}`;
    }

    /**
     * Orders an array of items that have a 'createdAt' field and limits the result if needed.
     * @param items Array of items to order.
     * @param limit Maximum number of items to return. Use 0 for no limit.
     * @param order Order type: 'asc' (oldest first) or 'desc' (newest first).
     * @returns Ordered (and limited) array.
     */
    private orderByCreatedAtAndLimit<T extends { createdAt?: Date | string }>(
        items: T[],
        limit: number = 0,
        order: 'asc' | 'desc' = 'asc',
    ): T[] {
        const safeTimestamp = (item: T): number => {
            try {
                const dateValue = item.createdAt;
                if (!dateValue) return 0;
                const timestamp = new Date(dateValue).getTime();
                return isNaN(timestamp) ? 0 : timestamp;
            } catch (error) {
                console.error('Error converting createdAt:', error);
                return 0;
            }
        };

        // Order the items based on their createdAt timestamp.
        const ordered = items.sort((a, b) => {
            const diff = safeTimestamp(a) - safeTimestamp(b);
            return order === 'asc' ? diff : -diff;
        });

        return limit > 0 ? ordered.slice(0, limit) : ordered;
    }

    /**
     * Filters and orders Kody Rules.
     * It selects directory-specific, repository-specific and global active rules, removes duplicates,
     * orders them by createdAt (oldest first), and if not in cloud mode, limits the result to MAX_KODY_RULES.
     *
     * @param rules Array of KodyRules.
     * @param repositoryId Repository identifier.
     * @param directoryId Optional directory identifier.
     * @returns Array of filtered, ordered, and possibly limited KodyRules.
     */
    filterKodyRules(
        rules: Partial<IKodyRule>[] = [],
        repositoryId: string,
        directoryId?: string,
    ): Partial<IKodyRule>[] {
        if (!rules?.length) {
            return [];
        }

        const repositoryRules: Partial<IKodyRule>[] = [];
        const directoryRules: Partial<IKodyRule>[] = [];
        const globalRules: Partial<IKodyRule>[] = [];

        for (const rule of rules) {
            if (rule.status !== KodyRulesStatus.ACTIVE) {
                continue;
            }

            if (rule.repositoryId === 'global') {
                globalRules.push(rule);
                continue;
            }

            if (rule.repositoryId !== repositoryId) {
                continue;
            }

            if (directoryId && rule.directoryId) {
                if (rule.directoryId === directoryId) {
                    directoryRules.push(rule);
                }
            } else {
                repositoryRules.push(rule);
            }
        }

        const mergedRules = [
            ...repositoryRules,
            ...directoryRules,
            ...globalRules,
        ];
        const mergedRulesWithoutDuplicates =
            this.extractUniqueKodyRules(mergedRules);

        const limit = this.isCloud ? 0 : this.MAX_KODY_RULES;
        const orderedRules = this.orderByCreatedAtAndLimit(
            mergedRulesWithoutDuplicates,
            limit,
            'asc',
        );

        return orderedRules;
    }

    /**
     * Removes duplicate Kody Rules based on the 'rule' property.
     * @param kodyRules Array of KodyRules.
     * @returns Array of unique KodyRules.
     */
    private extractUniqueKodyRules(
        kodyRules: Partial<IKodyRule>[],
    ): Partial<IKodyRule>[] {
        const seenRules = new Set<string>();
        const uniqueKodyRules: Partial<IKodyRule>[] = [];

        kodyRules.forEach((kodyRule) => {
            if (kodyRule?.rule && !seenRules.has(kodyRule.rule)) {
                seenRules.add(kodyRule.rule);
                uniqueKodyRules.push(kodyRule);
            }
        });

        return uniqueKodyRules;
    }

    /**
     * Retrieves the specific Kody rules for a file based on glob patterns and inheritance settings.
     * @param filename Name of the file to be checked.
     * @param kodyRules Array of objects containing the pattern and Kody rules.
     * @param directoryId Directory identifier to match inheritance rules.
     * @param repositoryId Repository identifier to match repository-specific rules.
     * @returns Array of Kody rules applicable to the file.
     */
    getKodyRulesForFile(
        fileName: string | null,
        kodyRules: Partial<IKodyRule>[],
        filters: {
            directoryId?: string;
            repositoryId?: string;
            useInclude?: boolean;
            useExclude?: boolean;
        },
    ) {
        const {
            directoryId,
            repositoryId,
            useInclude = true,
            useExclude = true,
        } = filters;

        if (!kodyRules?.length) {
            return [];
        }

        // Normalize the path by replacing backslashes with forward slashes (in case it's on Windows)
        const normalizedFilename =
            fileName?.replace(/\\/g, '/')?.replace(/^\//, '') ?? null;

        const getGlobBasePath = (pattern: string): string => {
            const globChars = ['*', '?', '{', '}', '[', ']', '!'];
            const parts = pattern.split('/');
            const basePathParts: string[] = [];

            for (const part of parts) {
                // Check if any glob character exists in the current path segment
                if (globChars.some((char) => part.includes(char))) {
                    break; // Stop at the first segment with a wildcard
                }
                basePathParts.push(part);
            }

            return basePathParts.join('/');
        };

        // Check if the rule's path matches the file's path
        const isPathMatch = (rule: Partial<IKodyRule>): boolean => {
            // If we aren't checking a specific file, all paths match.
            if (normalizedFilename === null) {
                return true;
            }

            // If the rule has no path defined, it matches all files.
            const rulePath = rule.path?.trim();
            if (!rulePath) {
                return true;
            }

            // Use glob matching to check if the file matches the rule's path pattern.
            if (isFileMatchingGlob(normalizedFilename, [rulePath])) {
                return true;
            }

            // Check if it's the base path (folder) of the file
            if (getGlobBasePath(rulePath) === normalizedFilename) {
                return true;
            }

            return false;
        };

        // Check if the rule matches the repository (global or specific)
        const isRepositoryMatch = (rule: Partial<IKodyRule>): boolean => {
            // If we aren't checking a specific repository, all rules match.
            if (!repositoryId) return true;

            // Match if the rule is global or specific to the repository
            return (
                rule?.repositoryId === 'global' ||
                rule?.repositoryId === repositoryId
            );
        };

        const isInheritanceMatch = (rule: Partial<IKodyRule>): boolean => {
            // If we aren't checking a specific directory or repository, all rules match.
            if (!directoryId && !repositoryId) return true;

            const {
                inheritable = true,
                exclude = [],
                include = [],
            } = rule.inheritance ?? {};

            // If the rule is not inheritable, it doesn't match.
            if (!inheritable) return false;

            // Check if the current directory or repository is excluded or included
            const isExcluded =
                useExclude &&
                ((directoryId && exclude.includes(directoryId)) ||
                    (repositoryId && exclude.includes(repositoryId)));

            const isIncluded =
                useInclude &&
                ((directoryId && include.includes(directoryId)) ||
                    (repositoryId && include.includes(repositoryId)));

            // If excluded, it doesn't match. If not excluded, it matches if include is empty or it is included.
            return !isExcluded && (include.length === 0 || isIncluded);
        };

        return kodyRules?.filter((rule) => {
            if (!rule) return false; // Skip invalid rules

            // If we are querying at the repository level (no directoryId is provided)
            // we do not allow rules that are specific to a directory (they cannot match)
            if (repositoryId && !directoryId && rule.directoryId) {
                return false;
            }

            return (
                isPathMatch(rule) &&
                isRepositoryMatch(rule) &&
                isInheritanceMatch(rule)
            );
        });
    }
}
