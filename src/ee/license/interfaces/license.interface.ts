/**
 * Interface and types for license service.
 */

export enum SubscriptionStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  PAYMENT_FAILED = 'payment_failed',
  CANCELED = 'canceled',
  EXPIRED = 'expired',
  SELF_HOSTED = 'self-hosted',
}

export type OrganizationLicenseValidationResult = {
  valid: boolean;
  subscriptionStatus?: SubscriptionStatus;
  trialEnd?: Date;
  numberOfLicenses?: number;
};

export type ValidateOrganizationLicenseParams = {
  organizationId: string;
  teamId: string;
};

export type UserWithLicense = {
  git_id: string;
};

export interface ILicenseService {
  /**
   * Validate organization license.
   * 
   * @param params Organization ID and team ID.
   * @returns Promise with validation result.
   */
  validateOrganizationLicense(
    params: ValidateOrganizationLicenseParams,
  ): Promise<OrganizationLicenseValidationResult>;

  /**
   * Get all users with license.
   * 
   * @param params Organization ID and team ID.
   * @returns Promise with array of users with license.
   */
  getAllUsersWithLicense(
    params: ValidateOrganizationLicenseParams,
  ): Promise<UserWithLicense[]>;
}
