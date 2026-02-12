import * as fs from 'fs';
import * as path from 'path';
import { CONFIG } from '../utils/constants';
import { GraphCache, CachedFileEntry } from './graphCache';
import Logger from '../utils/logger';

const CPP_EXTENSIONS = new Set([
    '.cpp', '.h', '.hpp', '.cc', '.cxx', '.hxx', '.c', '.hh', '.inl', '.ipp',
]);

const HEADER_EXTENSIONS = new Set(['.h', '.hpp', '.hxx', '.hh', '.inl', '.ipp']);

/**
 * Builds a C++ #include dependency graph by scanning the workspace.
 * Tracks reverse dependencies so we can answer:
 * "If header X changes, which files need to recompile?"
 */
export interface ScanOptions {
    /** Relative directories to scan. Empty = entire workspace. */
    includePaths: string[];
    /** Relative directories to exclude (on top of built-in skip list). */
    excludePaths: string[];
    /**
     * When provided, this is the authoritative set of files that belong
     * to the build (from a .sln / .vcxproj). The dependency graph will
     * still scan all reachable files for #include edges, but totalFiles
     * and getAffectedFiles will be scoped to this set.
     */
    projectScope?: Set<string>;
}

export class DependencyGraph {
    /** header-relative-path  →  set of files that #include it */
    private reverseDeps: Map<string, Set<string>> = new Map();

    /** All C++ files found (repo-relative, forward-slash) */
    private allFiles: Set<string> = new Set();

    /** filename.lower()  →  [repo-relative paths] (for fuzzy include resolution) */
    private fileIndex: Map<string, string[]> = new Map();

    private rootPath: string;
    private _built = false;
    private extraExcludes: Set<string> = new Set();
    /** When set, only these files count towards the denominator/results. */
    private projectScope: Set<string> | null = null;
    /** Per-file mtime at last parse, used for incremental builds */
    private fileMtimes: Map<string, number> = new Map();
    /** Per-file resolved includes, used for cache persistence */
    private fileIncludes: Map<string, string[]> = new Map();

    constructor(rootPath: string) {
        this.rootPath = rootPath;
    }

    get isBuilt(): boolean {
        return this._built;
    }
    get totalFiles(): number {
        if (this.projectScope) {
            return this.projectScope.size;
        }
        return this.allFiles.size;
    }

    /** Return the full set of discovered C++ files (repo-relative). */
    getAllFiles(): Set<string> {
        return this.allFiles;
    }

    // ── Build ────────────────────────────────────────────────────────

    /**
     * Load a previously-cached graph. Files whose mtime differs from
     * the cached value will be re-parsed during the next build().
     */
    loadCache(cache: GraphCache): void {
        this.reverseDeps.clear();
        this.allFiles.clear();
        this.fileIndex.clear();
        this.fileMtimes.clear();
        this.fileIncludes.clear();

        for (const [relPath, entry] of Object.entries(cache.files)) {
            this.allFiles.add(relPath);
            this.fileMtimes.set(relPath, entry.mtime);
            this.fileIncludes.set(relPath, entry.includes);

            const key = path.basename(relPath).toLowerCase();
            if (!this.fileIndex.has(key)) {
                this.fileIndex.set(key, []);
            }
            this.fileIndex.get(key)!.push(relPath);

            // Rebuild reverse deps from cached includes
            for (const inc of entry.includes) {
                if (!this.reverseDeps.has(inc)) {
                    this.reverseDeps.set(inc, new Set());
                }
                this.reverseDeps.get(inc)!.add(relPath);
            }
        }

        this._built = true;
    }

    /** Export current state as a serialisable cache object. */
    toCache(): GraphCache {
        const files: Record<string, CachedFileEntry> = {};
        for (const relPath of this.allFiles) {
            files[relPath] = {
                mtime: this.fileMtimes.get(relPath) ?? 0,
                includes: this.fileIncludes.get(relPath) ?? [],
            };
        }
        return {
            rootPath: this.rootPath,
            builtAt: new Date().toISOString(),
            files,
        };
    }

    async build(
        onProgress?: (msg: string) => void,
        options?: ScanOptions,
    ): Promise<void> {
      try {
        // If we have a warm cache, do an incremental build instead
        const hadCache = this._built && this.allFiles.size > 0;

        // Always refresh excludes and project scope
        this.extraExcludes = new Set(
            (options?.excludePaths ?? []).map((p) => this.norm(p)),
        );
        this.projectScope = options?.projectScope ?? null;

        if (!hadCache) {
            this.reverseDeps.clear();
            this.allFiles.clear();
            this.fileIndex.clear();
            this.fileMtimes.clear();
            this.fileIncludes.clear();
        }

        const includePaths = options?.includePaths ?? [];

        // ── Scan directories to discover files ───────────────────
        Logger.info('[build] Phase 1: directory scan starting');
        const previousFiles = new Set(this.allFiles);

        // For a full rebuild, clear allFiles before scanning
        if (!hadCache) {
            onProgress?.('Scanning for C++ files…');
        } else {
            onProgress?.('Incremental scan – checking for new/removed files…');
        }

        // Temporarily collect discovered files into a new set
        const discoveredFiles = new Set<string>();
        const savedAllFiles = this.allFiles;
        this.allFiles = discoveredFiles;

        if (includePaths.length > 0) {
            onProgress?.(`Scope limited to: ${includePaths.join(', ')}`);
            for (const rel of includePaths) {
                const abs = path.join(this.rootPath, rel);
                await this.scanDirectory(abs);
            }
        } else {
            await this.scanDirectory(this.rootPath);
        }

        // Restore and merge
        this.allFiles = savedAllFiles;
        Logger.info(`[build] Phase 1 done: discovered ${discoveredFiles.size} files`);

        // Detect new, removed, and existing files
        const newFiles: string[] = [];
        for (const f of discoveredFiles) {
            if (!this.allFiles.has(f)) {
                newFiles.push(f);
                this.allFiles.add(f);
            }
        }
        const removedFiles: string[] = [];
        for (const f of previousFiles) {
            if (!discoveredFiles.has(f)) {
                removedFiles.push(f);
                this.allFiles.delete(f);
                this.fileMtimes.delete(f);
                this.fileIncludes.delete(f);
            }
        }

        // Remove stale reverse-dep edges for removed files
        for (const removed of removedFiles) {
            this.reverseDeps.delete(removed);
            for (const [, deps] of this.reverseDeps) {
                deps.delete(removed);
            }
        }

        // ── Determine which files need re-parsing ────────────────
        Logger.info('[build] Phase 2: determining files to parse');
        const filesToParse: string[] = [...newFiles];

        if (hadCache) {
            // Check mtime for existing files
            const newFilesSet = new Set(newFiles); // O(1) lookups instead of array.includes
            for (const relPath of discoveredFiles) {
                if (newFilesSet.has(relPath)) {
                    continue; // already queued
                }
                const cachedMtime = this.fileMtimes.get(relPath);
                if (cachedMtime === undefined) {
                    filesToParse.push(relPath);
                    continue;
                }
                const absPath = path.join(this.rootPath, relPath);
                try {
                    const stat = await fs.promises.stat(absPath);
                    if (stat.mtimeMs !== cachedMtime) {
                        filesToParse.push(relPath);
                    }
                } catch {
                    // File disappeared between scan and stat
                    this.allFiles.delete(relPath);
                }
            }
        } else {
            // Full build – parse everything
            // NOTE: Do NOT use `filesToParse.push(...this.allFiles)` here.
            // The spread operator converts the Set into individual function
            // arguments, which exceeds V8's maximum call-stack for large
            // projects (100 k+ files).
            filesToParse.length = 0;
            for (const f of this.allFiles) {
                filesToParse.push(f);
            }
        }

        if (hadCache) {
            onProgress?.(
                `${this.allFiles.size} files total – ` +
                `${newFiles.length} new, ${removedFiles.length} removed, ` +
                `${filesToParse.length} to (re)parse.`,
            );
        } else {
            onProgress?.(`Found ${this.allFiles.size} C++ files. Parsing #includes…`);
        }

        // ── Parse #includes for files that need it ─────────────
        Logger.info(`[build] Phase 3: parsing ${filesToParse.length} files`);
        let count = 0;
        for (const relPath of filesToParse) {
            // Clear old edges for this file before re-parsing
            const oldIncludes = this.fileIncludes.get(relPath);
            if (oldIncludes) {
                for (const inc of oldIncludes) {
                    this.reverseDeps.get(inc)?.delete(relPath);
                }
            }

            await this.parseIncludes(relPath);
            count++;
            if (count % 500 === 0) {
                onProgress?.(`Parsed ${count}/${filesToParse.length} files…`);
            }
        }

        this._built = true;
        const scopeLabel = this.projectScope
            ? `${this.projectScope.size} project files (${this.allFiles.size} scanned for #includes)`
            : `${this.allFiles.size} files`;
        onProgress?.(`Dependency graph ready – ${scopeLabel}, ${this.reverseDeps.size} tracked headers.`);
        Logger.info('[build] Complete');
      } catch (err: any) {
        Logger.error(`[build] CRASHED: ${err.message}`);
        Logger.error(`[build] Stack: ${err.stack}`);
        throw err;
      }
    }

    // ── Query ────────────────────────────────────────────────────────

    /**
     * Given a set of changed files (repo-relative paths from git),
     * returns every file that would need to recompile.
     *
     * Logic:
     *  • Changed .cpp/.c  → only that file rebuilds.
     *  • Changed header   → every file that (transitively) includes it rebuilds.
     */
    getAffectedFiles(changedFiles: string[]): Set<string> {
        const affected = new Set<string>();
        const queue: string[] = [];

        for (const file of changedFiles) {
            const n = this.norm(file);
            affected.add(n);
            if (this.isHeader(n)) {
                queue.push(n);
            }
        }

        // BFS through reverse dependencies
        while (queue.length > 0) {
            const current = queue.shift()!;
            const deps = this.reverseDeps.get(current);
            if (!deps) {
                continue;
            }
            for (const dep of deps) {
                if (!affected.has(dep)) {
                    affected.add(dep);
                    if (this.isHeader(dep)) {
                        queue.push(dep);
                    }
                }
            }
        }

        // If a project scope is defined, only keep files that are in the build
        if (this.projectScope) {
            const scoped = new Set<string>();
            for (const f of affected) {
                if (this.projectScope.has(f)) {
                    scoped.add(f);
                }
            }
            return scoped;
        }

        return affected;
    }

    /** How many files directly #include this path? */
    getDependentCount(filePath: string): number {
        return this.reverseDeps.get(this.norm(filePath))?.size ?? 0;
    }

    // ── Internals ────────────────────────────────────────────────────

    private isHeader(filePath: string): boolean {
        return HEADER_EXTENSIONS.has(path.extname(filePath).toLowerCase());
    }

    private async scanDirectory(startDir: string): Promise<void> {
        // Iterative BFS to avoid stack overflow on deep directory trees.
        // We track visited directories by their real (resolved) path to
        // prevent infinite loops caused by symlinks / junction points.
        const visited = new Set<string>();
        const dirQueue: string[] = [startDir];
        let dirCount = 0;

        while (dirQueue.length > 0) {
            const dir = dirQueue.shift()!;

            // Resolve symlinks / junctions so we detect cycles
            let realDir: string;
            try {
                realDir = await fs.promises.realpath(dir);
            } catch {
                continue; // broken link – skip
            }
            if (visited.has(realDir)) {
                continue;
            }
            visited.add(realDir);
            dirCount++;

            // Safety valve – stop before exhausting memory
            if (dirCount > 500_000) {
                Logger.warn(`Scanned ${dirCount} directories – stopping to avoid runaway traversal.`);
                break;
            }

            let entries: fs.Dirent[];
            try {
                entries = await fs.promises.readdir(dir, { withFileTypes: true });
            } catch {
                continue;
            }

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory() || entry.isSymbolicLink()) {
                    // For symlinks, isDirectory() may be false – we handle
                    // them above via realpath + visited-set.
                    if (this.shouldSkip(fullPath, entry.name)) {
                        continue;
                    }
                    dirQueue.push(fullPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (CPP_EXTENSIONS.has(ext)) {
                        const rel = this.norm(path.relative(this.rootPath, fullPath));
                        this.allFiles.add(rel);

                        const key = entry.name.toLowerCase();
                        if (!this.fileIndex.has(key)) {
                            this.fileIndex.set(key, []);
                        }
                        this.fileIndex.get(key)!.push(rel);
                    }
                }
            }
        }
    }

    private shouldSkip(dirFullPath: string, name: string): boolean {
        if (CONFIG.SCAN_SKIP_DIRS.includes(name) || name.startsWith('.')) {
            return true;
        }
        // Check user-configured excludePaths
        const rel = this.norm(path.relative(this.rootPath, dirFullPath));
        if (this.extraExcludes.has(rel)) {
            return true;
        }
        // Also match if any exclude is a parent of this path
        for (const ex of this.extraExcludes) {
            if (rel.startsWith(ex + '/')) {
                return true;
            }
        }
        return false;
    }

    private async parseIncludes(relPath: string): Promise<void> {
        const absPath = path.join(this.rootPath, relPath);
        let content: string;
        let mtime = 0;
        try {
            const stat = await fs.promises.stat(absPath);
            mtime = stat.mtimeMs;
            content = await fs.promises.readFile(absPath, 'utf-8');
        } catch {
            return;
        }

        const fileDir = path.dirname(absPath);
        const regex = /^\s*#\s*include\s*"([^"]+)"/gm;
        let match: RegExpExecArray | null;
        const resolvedIncludes: string[] = [];

        while ((match = regex.exec(content)) !== null) {
            const includePath = match[1];
            const resolved = this.resolveInclude(includePath, fileDir);
            if (resolved) {
                resolvedIncludes.push(resolved);
                if (!this.reverseDeps.has(resolved)) {
                    this.reverseDeps.set(resolved, new Set());
                }
                this.reverseDeps.get(resolved)!.add(relPath);
            }
        }

        this.fileMtimes.set(relPath, mtime);
        this.fileIncludes.set(relPath, resolvedIncludes);
    }

    private resolveInclude(includePath: string, fromDir: string): string | null {
        // 1) Relative to the including file's directory
        const relToFile = path.join(fromDir, includePath);
        if (fs.existsSync(relToFile)) {
            return this.norm(path.relative(this.rootPath, relToFile));
        }

        // 2) Relative to the project root
        const relToRoot = path.join(this.rootPath, includePath);
        if (fs.existsSync(relToRoot)) {
            return this.norm(path.relative(this.rootPath, relToRoot));
        }

        // 3) Fuzzy match by filename
        const fileName = path.basename(includePath).toLowerCase();
        const candidates = this.fileIndex.get(fileName);
        if (candidates && candidates.length > 0) {
            const normalizedInclude = this.norm(includePath);
            for (const candidate of candidates) {
                if (candidate.endsWith(normalizedInclude)) {
                    return candidate;
                }
            }
            if (candidates.length === 1) {
                return candidates[0];
            }
        }

        return null; // system header or unresolvable
    }

    private norm(p: string): string {
        return p.replace(/\\/g, '/');
    }
}