import * as vscode from 'vscode';
import { GitService } from '../git/gitService';
import { ChangeAnalyzer } from '../analysis/changeAnalyzer';
import { ImpactTreeDataProvider } from '../views/treeDataProvider';
import { GraphCacheManager } from '../analysis/graphCache';
import Logger from '../utils/logger';

/**
 * Main command handler – fetches remote, discovers incoming commits,
 * runs dependency analysis, and pushes the report into the tree view.
 */
let analysisRunning = false;

export async function runAnalysis(
    treeDataProvider: ImpactTreeDataProvider,
    cacheManager?: GraphCacheManager,
    options?: { silent?: boolean },
): Promise<void> {
    if (analysisRunning) {
        if (!options?.silent) {
            vscode.window.showInformationMessage('An analysis is already running.');
        }
        Logger.info('Analysis skipped – already running.');
        return;
    }
    analysisRunning = true;

    try {
        await runAnalysisInner(treeDataProvider, cacheManager, options);
    } finally {
        analysisRunning = false;
    }
}

async function runAnalysisInner(
    treeDataProvider: ImpactTreeDataProvider,
    cacheManager?: GraphCacheManager,
    options?: { silent?: boolean },
): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        if (!options?.silent) {
            vscode.window.showErrorMessage('No workspace folder open.');
        }
        return;
    }

    const repoPath = workspaceFolders[0].uri.fsPath;
    const silent = options?.silent ?? false;

    const progressLocation = silent
        ? vscode.ProgressLocation.Window
        : vscode.ProgressLocation.Notification;

    await vscode.window.withProgress(
        {
            location: progressLocation,
            title: 'RebuildRadar Analysis',
            cancellable: false,
        },
        async (progress) => {
            try {
                const gitService = new GitService(repoPath);

                // ── fetch ────────────────────────────────────────────
                progress.report({ message: 'Fetching from remote…' });
                treeDataProvider.setLoading('Fetching from remote…');
                try {
                    await gitService.fetch();
                } catch (e) {
                    Logger.warn('Could not fetch from remote – using local data.');
                }

                // ── discover tracking branch ─────────────────────────
                progress.report({ message: 'Resolving tracking branch…' });
                treeDataProvider.setLoading('Resolving tracking branch…');
                let trackingBranch = await gitService.getTrackingBranch();

                if (!trackingBranch) {
                    const remoteBranches = await gitService.getRemoteBranches();
                    if (remoteBranches.length === 0) {
                        if (!silent) {
                            vscode.window.showWarningMessage(
                                'No remote branches found. Push your branch or add a remote first.',
                            );
                        }
                        treeDataProvider.clearLoading();
                        return;
                    }
                    if (silent) {
                        // In silent/auto mode, use the first remote branch as default
                        trackingBranch = remoteBranches[0];
                    } else {
                        const picked = await vscode.window.showQuickPick(remoteBranches, {
                            placeHolder:
                                'No tracking branch found. Select a remote branch to compare against:',
                        });
                        if (!picked) {
                            treeDataProvider.clearLoading();
                            return;
                        }
                        trackingBranch = picked;
                    }
                }

                // ── analyse ──────────────────────────────────────────
                progress.report({ message: 'Building dependency graph & analysing commits…' });
                treeDataProvider.setLoading('Scanning C++ files…');
                const analyzer = new ChangeAnalyzer(gitService, repoPath, cacheManager);
                const report = await analyzer.analyze(trackingBranch, (msg) => {
                    progress.report({ message: msg });
                    treeDataProvider.setLoading(msg);
                });

                // ── update UI ────────────────────────────────────────
                treeDataProvider.setReport(report);

                if (report.commitImpacts.length === 0) {
                    if (!silent) {
                        vscode.window.showInformationMessage(
                            'No incoming commits found – you are up to date!',
                        );
                    }
                } else {
                    if (!silent) {
                        vscode.window.showInformationMessage(
                            `Found ${report.commitImpacts.length} incoming commit(s) – ` +
                                `${report.globalImpactPercentage.toFixed(1)}% rebuild impact.`,
                        );
                    }
                }
            } catch (error: any) {
                Logger.error(`Analysis failed: ${error.message}`);
                treeDataProvider.clearLoading();
                vscode.window.showErrorMessage(`Analysis failed: ${error.message}`);
            }
        },
    );
}