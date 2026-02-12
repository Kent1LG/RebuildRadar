import * as fs from 'fs';
import * as path from 'path';
import { ModuleDescriptor } from '../models/moduleDescriptor';
import Logger from '../utils/logger';

/**
 * Result of parsing a project file with module-level detail.
 */
export interface ProjectParseResult {
    /** Union of all C++ files across all projects (for build-scope filtering). */
    projectScope: Set<string>;
    /** Per-.vcxproj module descriptors (project name → its files). */
    modules: Map<string, ModuleDescriptor>;
}

/**
 * Parses Visual Studio solution (.sln) and project (.vcxproj) files
 * to extract the set of C++ files that are actually part of the build.
 *
 * Supports:
 *  - .sln  → discovers all .vcxproj references, then parses each
 *  - .vcxproj → extracts <ClCompile> and <ClInclude> items
 *  - .vcxproj.filters → same item groups (used as fallback)
 *
 * All returned paths are repo-relative with forward slashes.
 */
export class ProjectFileParser {
    private rootPath: string;

    constructor(rootPath: string) {
        this.rootPath = rootPath;
    }

    /**
     * Given a path to a .sln or .vcxproj (relative to workspace root),
     * returns the set of C++ file paths (repo-relative, forward-slash)
     * that are part of the build.
     */
    async parse(
        projectFilePath: string,
        onProgress?: (msg: string) => void,
    ): Promise<Set<string>> {
        const result = await this.parseWithModules(projectFilePath, onProgress);
        return result.projectScope;
    }

    /**
     * Like parse(), but also returns per-.vcxproj module descriptors
     * so the caller knows which files belong to which project/library.
     */
    async parseWithModules(
        projectFilePath: string,
        onProgress?: (msg: string) => void,
    ): Promise<ProjectParseResult> {
        const absPath = path.isAbsolute(projectFilePath)
            ? projectFilePath
            : path.join(this.rootPath, projectFilePath);

        const ext = path.extname(absPath).toLowerCase();

        if (ext === '.sln') {
            return this.parseSolution(absPath, onProgress);
        } else if (ext === '.vcxproj') {
            const files = await this.parseVcxproj(absPath, onProgress);
            const name = path.basename(absPath, '.vcxproj');
            const relDir = path.relative(this.rootPath, path.dirname(absPath)).replace(/\\/g, '/');
            const modules = new Map<string, ModuleDescriptor>();
            modules.set(name, { name, path: relDir, type: 'vcxproj', files });
            return { projectScope: files, modules };
        } else {
            Logger.warn(`Unsupported project file type: ${ext}`);
            return { projectScope: new Set(), modules: new Map() };
        }
    }

    // ── .sln parsing ─────────────────────────────────────────────────

    private async parseSolution(
        slnPath: string,
        onProgress?: (msg: string) => void,
    ): Promise<ProjectParseResult> {
        let content: string;
        try {
            content = await fs.promises.readFile(slnPath, 'utf-8');
        } catch (e: any) {
            Logger.error(`Cannot read solution file: ${e.message}`);
            return { projectScope: new Set(), modules: new Map() };
        }

        const slnDir = path.dirname(slnPath);
        const allFiles = new Set<string>();
        const modules = new Map<string, ModuleDescriptor>();

        // Match Project("...") = "Name", "relative\path.vcxproj", "GUID"
        const projectRegex =
            /Project\("[^"]*"\)\s*=\s*"[^"]*"\s*,\s*"([^"]+\.vcxproj)"\s*,/gi;
        let match: RegExpExecArray | null;
        const vcxprojPaths: string[] = [];

        while ((match = projectRegex.exec(content)) !== null) {
            const relToSln = match[1].replace(/\\/g, '/');
            const absVcxproj = path.resolve(slnDir, relToSln);
            if (fs.existsSync(absVcxproj)) {
                vcxprojPaths.push(absVcxproj);
            }
        }

        onProgress?.(
            `Solution contains ${vcxprojPaths.length} C++ project(s).`,
        );

        for (let i = 0; i < vcxprojPaths.length; i++) {
            const projName = path.basename(vcxprojPaths[i], '.vcxproj');
            const projDisplayName = path.basename(vcxprojPaths[i]);
            onProgress?.(
                `Parsing project ${i + 1}/${vcxprojPaths.length}: ${projDisplayName}`,
            );
            const projFiles = await this.parseVcxproj(vcxprojPaths[i]);
            projFiles.forEach((f) => allFiles.add(f));

            const relDir = path.relative(this.rootPath, path.dirname(vcxprojPaths[i])).replace(/\\/g, '/');
            modules.set(projName, {
                name: projName,
                path: relDir,
                type: 'vcxproj',
                files: projFiles,
            });
        }

        onProgress?.(
            `Solution scope: ${allFiles.size} C++ files across ${vcxprojPaths.length} project(s).`,
        );
        return { projectScope: allFiles, modules };
    }

    // ── .vcxproj parsing ─────────────────────────────────────────────

    private async parseVcxproj(
        vcxprojPath: string,
        onProgress?: (msg: string) => void,
    ): Promise<Set<string>> {
        let content: string;
        try {
            content = await fs.promises.readFile(vcxprojPath, 'utf-8');
        } catch (e: any) {
            Logger.error(`Cannot read project file: ${e.message}`);
            return new Set();
        }

        const projDir = path.dirname(vcxprojPath);
        const files = new Set<string>();

        // Match <ClCompile Include="..." /> and <ClInclude Include="..." />
        // Handles both self-closing and open/close tag variants
        const itemRegex =
            /<(?:ClCompile|ClInclude)\s+Include\s*=\s*"([^"]+)"/gi;
        let match: RegExpExecArray | null;

        while ((match = itemRegex.exec(content)) !== null) {
            const rawPath = match[1];
            const absFile = path.resolve(projDir, rawPath);

            // Convert to repo-relative
            const relPath = path.relative(this.rootPath, absFile);
            const normalized = relPath.replace(/\\/g, '/');

            // Skip files outside the workspace
            if (normalized.startsWith('..')) {
                continue;
            }

            files.add(normalized);
        }

        const projName = path.basename(vcxprojPath);
        onProgress?.(
            `${projName}: ${files.size} C++ files.`,
        );

        return files;
    }
}
