import * as vscode from 'vscode';
import { GitService } from '../git/gitService';
import { CommitParser } from '../git/commitParser';
import { DependencyGraph, ScanOptions } from './dependencyGraph';
import { ImpactEstimator } from './impactEstimator';
import { ImpactReport, CommitImpact } from '../models/impactReport';
import { ProjectFileParser } from './projectFileParser';
import { ModuleResolver, DetectionStrategy } from './moduleResolver';
import { ModuleDescriptor } from '../models/moduleDescriptor';
import { GraphCacheManager } from './graphCache';
import Logger from '../utils/logger';

/**
 * Orchestrates the full impact analysis:
 *   1. Build a C++ #include dependency graph from the workspace
 *   2. List incoming commits (HEAD..tracking branch)
 *   3. For each commit, compute which files would need to rebuild
 *   4. Aggregate into a global impact percentage
 *
 * Falls back to simple file-count metrics for non-C++ projects.
 */
export class ChangeAnalyzer {
    private gitService: GitService;
    private depGraph: DependencyGraph;
    private rootPath: string;
    private cacheManager: GraphCacheManager | null;
    private moduleResolver: ModuleResolver;

    constructor(
        gitService: GitService,
        rootPath: string,
        cacheManager?: GraphCacheManager,
    ) {
        this.gitService = gitService;
        this.rootPath = rootPath;
        this.depGraph = new DependencyGraph(rootPath);
        this.cacheManager = cacheManager ?? null;
        this.moduleResolver = new ModuleResolver(rootPath);
    }

    async analyze(
        trackingBranch: string,
        onProgress?: (message: string) => void,
    ): Promise<ImpactReport> {
        const report = (msg: string) => {
            Logger.info(msg);
            onProgress?.(msg);
        };

        // 1. Read user-configured scope from settings
        const config = vscode.workspace.getConfiguration('rebuildRadar');
        const projectFile = config.get<string>('projectFile', '');
        const moduleDetection = config.get<string>('moduleDetection', 'auto') as DetectionStrategy;
        const scanOptions: ScanOptions = {
            includePaths: config.get<string[]>('includePaths', []),
            excludePaths: config.get<string[]>('excludePaths', []),
        };

        // 1b. If a project file is set, parse it to get the build scope + modules
        let prebuiltModules: Map<string, ModuleDescriptor> | undefined;
        if (projectFile) {
            report(`Parsing project file: ${projectFile}`);
            const parser = new ProjectFileParser(this.rootPath);
            const parseResult = await parser.parseWithModules(projectFile, report);
            if (parseResult.projectScope.size > 0) {
                scanOptions.projectScope = parseResult.projectScope;
                report(`Project scope: ${parseResult.projectScope.size} files in the build.`);
            } else {
                report('Project file parsed but no files found – falling back to directory scan.');
            }
            if (parseResult.modules.size > 0) {
                prebuiltModules = parseResult.modules;
            }
        }

        if (scanOptions.includePaths.length > 0) {
            report(`Scan scoped to: ${scanOptions.includePaths.join(', ')}`);
        }
        if (scanOptions.excludePaths.length > 0) {
            report(`Excluding: ${scanOptions.excludePaths.join(', ')}`);
        }

        // 2. Build the dependency graph (scans workspace for C++ files)
        // Try to warm-start from cache
        if (this.cacheManager) {
            const cached = this.cacheManager.load(this.rootPath);
            if (cached) {
                report(`Loading cached graph (${Object.keys(cached.files).length} files from ${cached.builtAt})…`);
                this.depGraph.loadCache(cached);
            }
        }
        await this.depGraph.build(report, scanOptions);
        // Persist updated cache (wrapped in try-catch – don't let cache
        // serialisation failures block the analysis)
        if (this.cacheManager) {
            try {
                await this.cacheManager.save(this.depGraph.toCache());
            } catch (cacheErr: any) {
                Logger.warn(`Failed to save graph cache: ${cacheErr.message}`);
            }
        }

        // 3. Get incoming commits
        report('Discovering incoming commits…');
        const rawCommits = await this.gitService.getCommitsAhead(trackingBranch);
        report(`Found ${rawCommits.length} incoming commit(s).`);

        // 3b. Detect modules / libraries
        if (moduleDetection !== 'none') {
            report('Detecting project modules…');
            await this.moduleResolver.detect(
                moduleDetection,
                prebuiltModules,
                this.depGraph.getAllFiles(),
                report,
            );
            const modCount = this.moduleResolver.getModules().size;
            if (modCount > 0) {
                report(`Detected ${modCount} module(s) / libraries.`);
            }
        }

        // 4. Decide denominator
        let totalFiles = this.depGraph.totalFiles;
        const isCppProject = totalFiles > 0;
        if (!isCppProject) {
            report('No C++ files found – falling back to tracked-file count.');
            totalFiles = await this.gitService.getTotalFileCount();
        }

        // 5. Per-commit analysis
        const commitImpacts: CommitImpact[] = [];
        const allRebuildFiles = new Set<string>();
        let idx = 0;

        for (const raw of rawCommits) {
            idx++;
            report(`Analysing commit ${idx}/${rawCommits.length}: ${raw.message}`);
            const files = await this.gitService.getCommitFiles(raw.hash);
            const commitInfo = CommitParser.toCommitInfo(raw, files);
            const changedPaths = files.map((f) => f.filePath);

            let rebuildFiles: string[];
            if (isCppProject) {
                rebuildFiles = Array.from(this.depGraph.getAffectedFiles(changedPaths));
            } else {
                rebuildFiles = [...changedPaths];
            }

            rebuildFiles.forEach((f) => allRebuildFiles.add(f));

            commitImpacts.push({
                commit: commitInfo,
                impactPercentage: ImpactEstimator.calculatePercentage(
                    rebuildFiles.length,
                    totalFiles,
                ),
                affectedFiles: changedPaths,
                rebuildFiles,
                affectedModules: this.moduleResolver.groupByModule(rebuildFiles),
            });
        }

        // 6. Global impact + module breakdown
        const globalModuleImpacts = this.moduleResolver.groupByModule(allRebuildFiles);
        const totalModules = this.moduleResolver.getModules().size;

        return {
            globalImpactPercentage: ImpactEstimator.calculatePercentage(
                allRebuildFiles.size,
                totalFiles,
            ),
            totalProjectFiles: totalFiles,
            totalAffectedFiles: allRebuildFiles.size,
            commitImpacts,
            allRebuildFiles: Array.from(allRebuildFiles),
            totalModules,
            affectedModuleCount: globalModuleImpacts.length,
            moduleImpacts: globalModuleImpacts,
        };
    }
}