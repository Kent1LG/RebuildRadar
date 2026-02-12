import * as vscode from 'vscode';
import * as path from 'path';
import { ImpactTreeDataProvider } from './views/treeDataProvider';
import { runAnalysis } from './commands/analyzeCommits';
import { ImpactReportPanel } from './views/impactReportPanel';
import { GraphCacheManager } from './analysis/graphCache';
import Logger from './utils/logger';

export function activate(context: vscode.ExtensionContext) {
    const treeDataProvider = new ImpactTreeDataProvider();
    const cacheManager = new GraphCacheManager(context);

    const treeView = vscode.window.createTreeView('rebuildRadarView', {
        treeDataProvider,
        showCollapseAll: true,
    });

    const analyzeCmd = vscode.commands.registerCommand(
        'rebuildRadar.analyze',
        () => runAnalysis(treeDataProvider, cacheManager),
    );

    const refreshCmd = vscode.commands.registerCommand(
        'rebuildRadar.refresh',
        () => runAnalysis(treeDataProvider, cacheManager),
    );

    const showReportCmd = vscode.commands.registerCommand(
        'rebuildRadar.showReport',
        () => {
            const report = treeDataProvider.getReport();
            if (report) {
                ImpactReportPanel.render(context.extensionUri, report);
            } else {
                vscode.window.showInformationMessage(
                    'No impact analysis available. Run "RebuildRadar: Analyze" first.',
                );
            }
        },
    );

    // ── Context-menu commands ───────────────────────────────────
    const addIncludeCmd = vscode.commands.registerCommand(
        'rebuildRadar.addIncludePath',
        async (uri: vscode.Uri) => {
            if (!uri) { return; }
            const relPath = vscode.workspace.asRelativePath(uri, false);
            const config = vscode.workspace.getConfiguration('rebuildRadar');
            const current = config.get<string[]>('includePaths', []);
            if (current.includes(relPath)) {
                vscode.window.showInformationMessage(`"${relPath}" is already in includePaths.`);
                return;
            }
            await config.update('includePaths', [...current, relPath], vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage(`Added "${relPath}" to includePaths.`);
        },
    );

    const addExcludeCmd = vscode.commands.registerCommand(
        'rebuildRadar.addExcludePath',
        async (uri: vscode.Uri) => {
            if (!uri) { return; }
            const relPath = vscode.workspace.asRelativePath(uri, false);
            const config = vscode.workspace.getConfiguration('rebuildRadar');
            const current = config.get<string[]>('excludePaths', []);
            if (current.includes(relPath)) {
                vscode.window.showInformationMessage(`"${relPath}" is already in excludePaths.`);
                return;
            }
            await config.update('excludePaths', [...current, relPath], vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage(`Added "${relPath}" to excludePaths.`);
        },
    );

    const setProjectFileCmd = vscode.commands.registerCommand(
        'rebuildRadar.setProjectFile',
        async (uri: vscode.Uri) => {
            if (!uri) { return; }
            const relPath = vscode.workspace.asRelativePath(uri, false);
            const config = vscode.workspace.getConfiguration('rebuildRadar');
            await config.update('projectFile', relPath, vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage(`Project file set to "${relPath}".`);
        },
    );

    context.subscriptions.push(
        treeDataProvider, treeView, analyzeCmd, refreshCmd, showReportCmd,
        addIncludeCmd, addExcludeCmd, setProjectFileCmd,
    );

    // ── Auto-scan on startup ───────────────────────────────────────
    const config = vscode.workspace.getConfiguration('rebuildRadar');
    const autoScan = config.get<boolean>('autoScan', true);

    if (autoScan) {
        // Slight delay to let VS Code finish loading before we start scanning
        setTimeout(() => {
            Logger.info('Auto-scan triggered on activation.');
            runAnalysis(treeDataProvider, cacheManager, { silent: true });
        }, 3000);
    }
}

export function deactivate() {}