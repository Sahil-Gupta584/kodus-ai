// /**
//  * @module core/types/storage-types
//  * @description Unified storage types and enums
//  */

// /**
//  * Storage adapter types - UNIFIED across all components
//  */
// export enum StorageType {
//     INMEMORY = 'memory',
//     MONGODB = 'mongodb',
// }

// /**
//  * Convert OrchestrationConfig storage type to adapter type
//  */
// export function toAdapterType(storageType: StorageType): StorageType {
//     switch (storageType) {
//         case StorageType.INMEMORY:
//             return StorageType.INMEMORY;
//         case StorageType.MONGODB:
//             return StorageType.MONGODB;
//         default:
//             return StorageType.INMEMORY;
//     }
// }

// /**
//  * Convert string to adapter type (with fallback)
//  */
// export function stringToAdapterType(type: string): StorageType {
//     switch (type) {
//         case 'memory':
//             return StorageType.INMEMORY;
//         case 'mongodb':
//             return StorageType.MONGODB;

//         case 'memory':
//             return StorageType.INMEMORY;
//         default:
//             return StorageType.INMEMORY;
//     }
// }
