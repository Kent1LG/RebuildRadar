import { CommitInfo } from './commitInfo';

export type ModuleType = 'vcxproj' | 'unreal' | 'cmake' | 'directory';

export interface ModuleImpact {
    /** Display name of the module / library */
    moduleName: string;
    /** Repo-relative path to the module root */
    modulePath: string;
    /** How the module was detected */
    moduleType: ModuleType;
    /** Total C++ files that belong to this module */
    totalFiles: number;
    /** How many of those files would need to rebuild */
    affectedFiles: number;
    /** The actual repo-relative paths of the affected files */
    affectedFileList: string[];
}

export interface CommitImpact {
    commit: CommitInfo;
    impactPercentage: number;
    affectedFiles: string[];
    rebuildFiles: string[];
    /** Modules affected by this commit */
    affectedModules: ModuleImpact[];
}

export interface ImpactReport {
    globalImpactPercentage: number;
    totalProjectFiles: number;
    totalAffectedFiles: number;
    commitImpacts: CommitImpact[];
    allRebuildFiles: string[];
    /** Total number of detected modules / libraries */
    totalModules: number;
    /** How many modules have at least one file that would rebuild */
    affectedModuleCount: number;
    /** Per-module breakdown (global, across all commits) */
    moduleImpacts: ModuleImpact[];
}