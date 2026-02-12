import * as fs from 'fs';
import * as path from 'path';
import { ModuleDescriptor } from '../models/moduleDescriptor';
import { ModuleImpact, ModuleType } from '../models/impactReport';
import { CONFIG } from '../utils/constants';
import Logger from '../utils/logger';

const CPP_EXTENSIONS = new Set([
    '.cpp', '.h', '.hpp', '.cc', '.cxx', '.hxx', '.c', '.hh', '.inl', '.ipp',
]);

export type DetectionStrategy = 'auto' | 'vcxproj' | 'unreal' | 'cmake' | 'directory' | 'none';

/**
 * Detects project modules / libraries from the workspace and maps
 * files to their owning module.  Supports multiple detection strategies
 * tried in priority order when set to "auto":
 *
 *   1. Visual Studio  — each .vcxproj referenced by a .sln
 *   2. Build.cs       — each folder containing a *.Build.cs file (Unreal-style)
 *   3. CMake          — each CMakeLists.txt with add_library / add_executable
 *   4. Directory      — top-level subdirs of Source/ or src/
 */
export class ModuleResolver {
    private rootPath: string;
    private modules = new Map<string, ModuleDescriptor>();
    /** Reverse lookup: repo-relative file path → module name */
    private fileToModule = new Map<string, string>();

    constructor(rootPath: string) {
        this.rootPath = rootPath;
    }

    // ── Public API ───────────────────────────────────────────────────

    /** Run detection (or accept pre-built modules from ProjectFileParser). */
    async detect(
        strategy: DetectionStrategy,
        prebuiltModules?: Map<string, ModuleDescriptor>,
        allFiles?: Set<string>,
        onProgress?: (msg: string) => void,
    ): Promise<void> {
        this.modules.clear();
        this.fileToModule.clear();

        if (strategy === 'none') {
            return;
        }

        // If the ProjectFileParser already gave us per-vcxproj modules, use them.
        if (prebuiltModules && prebuiltModules.size > 0 &&
            (strategy === 'auto' || strategy === 'vcxproj')) {
            onProgress?.(`Using ${prebuiltModules.size} module(s) from project file.`);
            for (const [name, mod] of prebuiltModules) {
                this.modules.set(name, mod);
            }
            this.buildReverseIndex();
            return;
        }

        const strategies: DetectionStrategy[] =
            strategy === 'auto'
                ? ['unreal', 'cmake', 'directory']
                : [strategy];

        for (const s of strategies) {
            switch (s) {
                case 'unreal':
                    await this.detectBuildCs(onProgress);
                    break;
                case 'cmake':
                    await this.detectCMake(onProgress);
                    break;
                case 'directory':
                    this.detectDirectory(allFiles, onProgress);
                    break;
            }
            if (this.modules.size > 0) {
                Logger.info(`Module detection: "${s}" found ${this.modules.size} module(s).`);
                break; // first successful strategy wins
            }
        }

        this.buildReverseIndex();
    }

    /** Which module does a given file belong to? */
    resolveFileModule(filePath: string): string | null {
        return this.fileToModule.get(this.norm(filePath)) ?? null;
    }

    /** All detected modules. */
    getModules(): Map<string, ModuleDescriptor> {
        return this.modules;
    }

    /**
     * Group a set of affected file paths into per-module impact summaries.
     * Only modules with at least one affected file are returned.
     */
    groupByModule(affectedFiles: Iterable<string>): ModuleImpact[] {
        if (this.modules.size === 0) {
            return [];
        }

        // Bucket affected files by module
        const buckets = new Map<string, string[]>();
        for (const f of affectedFiles) {
            const mod = this.resolveFileModule(f);
            if (!mod) { continue; }
            if (!buckets.has(mod)) { buckets.set(mod, []); }
            buckets.get(mod)!.push(f);
        }

        const impacts: ModuleImpact[] = [];
        for (const [name, files] of buckets) {
            const desc = this.modules.get(name);
            if (!desc) { continue; }
            impacts.push({
                moduleName: name,
                modulePath: desc.path,
                moduleType: desc.type,
                totalFiles: desc.files.size,
                affectedFiles: files.length,
                affectedFileList: files,
            });
        }

        // Sort: most-affected first
        impacts.sort((a, b) => b.affectedFiles - a.affectedFiles);
        return impacts;
    }

    // ── Detection strategies ─────────────────────────────────────────

    /**
     * Build.cs strategy: each folder containing a *.Build.cs file = a module.
     * Collects all C++ files beneath that folder.
     */
    private async detectBuildCs(onProgress?: (msg: string) => void): Promise<void> {
        const buildCsFiles = await this.findFiles('*.Build.cs');
        if (buildCsFiles.length === 0) { return; }

        onProgress?.(`Found ${buildCsFiles.length} Build.cs module(s).`);

        for (const buildCs of buildCsFiles) {
            const moduleDir = path.dirname(buildCs);
            const moduleName = path.basename(buildCs).replace('.Build.cs', '');
            const relDir = this.norm(path.relative(this.rootPath, moduleDir));
            const files = await this.collectCppFiles(moduleDir);

            if (files.size > 0) {
                this.modules.set(moduleName, {
                    name: moduleName,
                    path: relDir,
                    type: 'unreal',
                    files,
                });
            }
        }
    }

    /**
     * CMake: scan for CMakeLists.txt that contain add_library or add_executable.
     * Each such file's directory = a module, named after the target.
     */
    private async detectCMake(onProgress?: (msg: string) => void): Promise<void> {
        const cmakeFiles = await this.findFiles('CMakeLists.txt');
        if (cmakeFiles.length === 0) { return; }

        let found = 0;
        for (const cmakePath of cmakeFiles) {
            let content: string;
            try {
                content = await fs.promises.readFile(cmakePath, 'utf-8');
            } catch { continue; }

            // Match add_library(name ...) or add_executable(name ...)
            const targetRegex = /(?:add_library|add_executable)\s*\(\s*(\S+)/gi;
            let m: RegExpExecArray | null;
            while ((m = targetRegex.exec(content)) !== null) {
                const targetName = m[1];
                if (targetName.startsWith('$') || targetName.startsWith('#')) { continue; }
                const moduleDir = path.dirname(cmakePath);
                const relDir = this.norm(path.relative(this.rootPath, moduleDir));
                const files = await this.collectCppFiles(moduleDir);

                if (files.size > 0 && !this.modules.has(targetName)) {
                    this.modules.set(targetName, {
                        name: targetName,
                        path: relDir,
                        type: 'cmake',
                        files,
                    });
                    found++;
                }
            }
        }
        if (found > 0) {
            onProgress?.(`Found ${found} CMake target(s).`);
        }
    }

    /**
     * Fallback: treat top-level subdirectories of Source/ or src/ as modules.
     * Uses the already-scanned allFiles set to avoid a second directory walk.
     */
    private detectDirectory(
        allFiles?: Set<string>,
        onProgress?: (msg: string) => void,
    ): void {
        if (!allFiles || allFiles.size === 0) { return; }

        // Find which top-level "source root" exists
        const sourceRoots = ['Source', 'src', 'Src', 'source'];
        let sourceRoot: string | null = null;
        for (const sr of sourceRoots) {
            const abs = path.join(this.rootPath, sr);
            if (fs.existsSync(abs)) {
                sourceRoot = sr;
                break;
            }
        }

        // Bucket files by their first directory component (or source-root child)
        const buckets = new Map<string, Set<string>>();
        for (const f of allFiles) {
            const parts = f.split('/');
            let bucketName: string;
            let bucketPath: string;

            if (sourceRoot && parts[0].toLowerCase() === sourceRoot.toLowerCase() && parts.length > 2) {
                bucketName = parts[1];
                bucketPath = `${parts[0]}/${parts[1]}`;
            } else if (parts.length > 1) {
                bucketName = parts[0];
                bucketPath = parts[0];
            } else {
                continue; // root-level file, skip
            }

            if (!buckets.has(bucketName)) {
                buckets.set(bucketName, new Set());
            }
            buckets.get(bucketName)!.add(f);
        }

        for (const [name, files] of buckets) {
            if (files.size < 2) { continue; } // skip trivial "modules"
            const firstFile = files.values().next().value!;
            const parts = firstFile.split('/');
            const modPath = sourceRoot && parts[0].toLowerCase() === sourceRoot.toLowerCase()
                ? `${parts[0]}/${parts[1]}`
                : parts[0];
            this.modules.set(name, {
                name,
                path: modPath,
                type: 'directory',
                files,
            });
        }

        if (this.modules.size > 0) {
            onProgress?.(`Directory-based detection: ${this.modules.size} module(s).`);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private buildReverseIndex(): void {
        this.fileToModule.clear();
        for (const [name, mod] of this.modules) {
            for (const f of mod.files) {
                // If a file is in multiple modules, first-registered wins
                if (!this.fileToModule.has(f)) {
                    this.fileToModule.set(f, name);
                }
            }
        }
    }

    /**
     * BFS-find files matching a glob-like basename pattern under rootPath.
     * Only checks the file name (not directory structure).
     */
    private async findFiles(pattern: string): Promise<string[]> {
        const results: string[] = [];
        const patternRegex = new RegExp(
            '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$',
            'i',
        );

        const dirQueue: string[] = [this.rootPath];
        const visited = new Set<string>();

        while (dirQueue.length > 0) {
            const dir = dirQueue.shift()!;
            let realDir: string;
            try { realDir = await fs.promises.realpath(dir); } catch { continue; }
            if (visited.has(realDir)) { continue; }
            visited.add(realDir);

            let entries: fs.Dirent[];
            try {
                entries = await fs.promises.readdir(dir, { withFileTypes: true });
            } catch { continue; }

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory() || entry.isSymbolicLink()) {
                    if (!CONFIG.SCAN_SKIP_DIRS.includes(entry.name) && !entry.name.startsWith('.')) {
                        dirQueue.push(fullPath);
                    }
                } else if (entry.isFile() && patternRegex.test(entry.name)) {
                    results.push(fullPath);
                }
            }
        }

        return results;
    }

    /** Collect all C++ files under a directory (iterative BFS). */
    private async collectCppFiles(startDir: string): Promise<Set<string>> {
        const files = new Set<string>();
        const dirQueue: string[] = [startDir];
        const visited = new Set<string>();

        while (dirQueue.length > 0) {
            const dir = dirQueue.shift()!;
            let realDir: string;
            try { realDir = await fs.promises.realpath(dir); } catch { continue; }
            if (visited.has(realDir)) { continue; }
            visited.add(realDir);

            let entries: fs.Dirent[];
            try {
                entries = await fs.promises.readdir(dir, { withFileTypes: true });
            } catch { continue; }

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory() || entry.isSymbolicLink()) {
                    if (!CONFIG.SCAN_SKIP_DIRS.includes(entry.name) && !entry.name.startsWith('.')) {
                        dirQueue.push(fullPath);
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (CPP_EXTENSIONS.has(ext)) {
                        files.add(this.norm(path.relative(this.rootPath, fullPath)));
                    }
                }
            }
        }

        return files;
    }

    private norm(p: string): string {
        return p.replace(/\\/g, '/');
    }
}