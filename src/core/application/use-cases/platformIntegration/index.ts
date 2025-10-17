import codeManagementUseCases from './codeManagement';
import projectManagementUseCases from './projectManagement';

export const UseCases = [
    ...projectManagementUseCases,
    ...codeManagementUseCases,
];
