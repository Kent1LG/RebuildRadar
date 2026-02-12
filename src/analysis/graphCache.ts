import * as vscode from 'vscode';
import Logger from '../utils/logger';

/**
 * Serialisable snapshot of the dependency graph that can be persisted
 * across VS Code sessions using ExtensionContext.globalState.
 *
 * We store:
 *  - Per-file mtime so we know what changed since last scan
 *  - Per-file include edges so we can skip re-parsing untouched files
 *  - The full file index for include resolution
 */
export interface CachedFileEntry {
    /** epoch ms of the file's last modification at scan time */
    mtime: number;
    /** repo-relative paths this file #includes (resolved) */
    includes: string[];
}

export interface GraphCache {
    /** Workspace root this cache was built for */
    rootPath: string;
    /** ISO string of when the cache was last built */
    builtAt: string;
    /** repo-relative path → cached data */
    files: Record<string, CachedFileEntry>;
}

const CACHE_KEY = 'rebuildRadar.graphCache';

export class GraphCacheManager {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /** Load cached graph for the given workspace root, or null if none / mismatched root. */
    load(rootPath: string): GraphCache | null {
        const raw = this.context.globalState.get<GraphCache>(CACHE_KEY);
        if (!raw) {
            Logger.info('No dependency graph cache found.');
            return null;
        }
        if (raw.rootPath !== rootPath) {
            Logger.info('Cache root mismatch – discarding.');
            return null;
        }
        Logger.info(`Loaded graph cache from ${raw.builtAt} (${Object.keys(raw.files).length} files).`);
        return raw;
    }

    /** Persist the graph cache. */
    async save(cache: GraphCache): Promise<void> {
        await this.context.globalState.update(CACHE_KEY, cache);
        Logger.info(`Graph cache saved (${Object.keys(cache.files).length} files).`);
    }

    /** Clear the cache. */
    async clear(): Promise<void> {
        await this.context.globalState.update(CACHE_KEY, undefined);
        Logger.info('Graph cache cleared.');
    }
}
