import { ModuleType } from './impactReport';

/**
 * Describes a detected library / module in the workspace.
 * Works for any project type (VS, CMake, Unreal Build.cs, directory-based).
 */
export interface ModuleDescriptor {
    /** Human-readable name (project name, CMake target, or directory name) */
    name: string;
    /** Repo-relative path to the module root directory */
    path: string;
    /** Detection strategy that found this module */
    type: ModuleType;
    /** Set of repo-relative C++ file paths that belong to this module */
    files: Set<string>;
}