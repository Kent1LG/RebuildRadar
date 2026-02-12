import * as vscode from 'vscode';
import * as path from 'path';
import { ImpactReport, CommitImpact, ModuleImpact } from '../models/impactReport';
import { IMPACT_THRESHOLDS } from '../utils/constants';

// ── Element types shown in the tree ──────────────────────────────────

interface LoadingElement {
    type: 'loading';
    message: string;
}

interface SummaryElement {
    type: 'summary';
    report: ImpactReport;
}

interface ModuleSectionElement {
    type: 'moduleSection';
    report: ImpactReport;
}

interface ModuleElement {
    type: 'module';
    module: ModuleImpact;
}

interface CommitElement {
    type: 'commit';
    impact: CommitImpact;
}

interface FileElement {
    type: 'file';
    filePath: string;
    changeType: string;
    dependentCount: number;
}

interface ConfigElement {
    type: 'config';
}

interface ConfigDetailElement {
    type: 'configDetail';
    label: string;
    value: string;
}

type TreeElement = LoadingElement | SummaryElement | ConfigElement | ConfigDetailElement | ModuleSectionElement | ModuleElement | CommitElement | FileElement;

// ── Provider ─────────────────────────────────────────────────────────

export class ImpactTreeDataProvider implements vscode.TreeDataProvider<TreeElement>, vscode.Disposable {
    private _onDidChangeTreeData = new vscode.EventEmitter<
        TreeElement | undefined | null | void
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private report: ImpactReport | null = null;
    private loading = false;
    private loadingMessage = '';
    private disposables: vscode.Disposable[] = [];

    constructor() {
        // Refresh the config node whenever settings change
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('rebuildRadar')) {
                    this._onDidChangeTreeData.fire();
                }
            })
        );
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }

    /** Show a loading spinner in the tree with a progress message. */
    setLoading(message: string): void {
        this.loading = true;
        this.loadingMessage = message;
        this._onDidChangeTreeData.fire();
    }

    /** Clear loading state (called automatically by setReport). */
    clearLoading(): void {
        this.loading = false;
        this.loadingMessage = '';
        this._onDidChangeTreeData.fire();
    }

    /** Push a new report into the tree (triggers refresh). */
    setReport(report: ImpactReport): void {
        this.loading = false;
        this.loadingMessage = '';
        this.report = report;
        vscode.commands.executeCommand('setContext', 'rebuildRadar.hasReport', true);
        this._onDidChangeTreeData.fire();
    }

    /** Retrieve the current report (used by the Show Report command). */
    getReport(): ImpactReport | null {
        return this.report;
    }

    // ── TreeDataProvider implementation ─────────────────────────────

    getTreeItem(element: TreeElement): vscode.TreeItem {
        switch (element.type) {
            case 'loading':
                return this.buildLoadingItem(element);
            case 'summary':
                return this.buildSummaryItem(element);
            case 'config':
                return this.buildConfigItem();
            case 'configDetail':
                return this.buildConfigDetailItem(element);
            case 'moduleSection':
                return this.buildModuleSectionItem(element);
            case 'module':
                return this.buildModuleItem(element);
            case 'commit':
                return this.buildCommitItem(element);
            case 'file':
                return this.buildFileItem(element);
        }
    }

    getChildren(element?: TreeElement): TreeElement[] {
        // Show loading indicator
        if (this.loading && !element) {
            return [{ type: 'loading', message: this.loadingMessage }];
        }

        if (!this.report && !element) {
            return [{ type: 'config' }];
        }

        // Root level
        if (!element) {
            const items: TreeElement[] = [
                { type: 'config' },
            ];
            if (this.report) {
                items.push({ type: 'summary', report: this.report });
            }
            // Show the module section if modules were detected
            if (this.report && this.report.totalModules > 0) {
                items.push({ type: 'moduleSection', report: this.report });
            }
            if (this.report) {
                for (const impact of this.report.commitImpacts) {
                    items.push({ type: 'commit', impact });
                }
            }
            return items;
        }

        // Children of config node
        if (element.type === 'config') {
            const cfg = vscode.workspace.getConfiguration('rebuildRadar');
            const details: TreeElement[] = [];
            const projectFile = cfg.get<string>('projectFile', '');
            details.push({ type: 'configDetail', label: 'Project', value: projectFile || '(not set)' });
            const includes = cfg.get<string[]>('includePaths', []);
            details.push({ type: 'configDetail', label: 'Include', value: includes.length > 0 ? includes.join(', ') : '(entire workspace)' });
            const excludes = cfg.get<string[]>('excludePaths', []);
            details.push({ type: 'configDetail', label: 'Exclude', value: excludes.length > 0 ? excludes.join(', ') : '(none)' });
            const modDetect = cfg.get<string>('moduleDetection', 'auto');
            details.push({ type: 'configDetail', label: 'Modules', value: modDetect });
            return details;
        }

        // Children of module section → individual modules
        if (element.type === 'moduleSection') {
            return element.report.moduleImpacts.map((m) => ({
                type: 'module' as const,
                module: m,
            }));
        }

        // Children of a module → affected files
        if (element.type === 'module') {
            return element.module.affectedFileList.map((f) => ({
                type: 'file' as const,
                filePath: f,
                changeType: 'rebuild',
                dependentCount: 0,
            }));
        }

        // Children of a commit node
        if (element.type === 'commit') {
            return element.impact.commit.affectedFiles.map((f) => ({
                type: 'file' as const,
                filePath: f.filePath,
                changeType: f.changeType,
                dependentCount: 0,
            }));
        }

        return [];
    }

    // ── Tree-item builders ───────────────────────────────────────────

    private buildConfigItem(): vscode.TreeItem {
        const cfg = vscode.workspace.getConfiguration('rebuildRadar');
        const projectFile = cfg.get<string>('projectFile', '');
        const label = projectFile ? `Project: ${projectFile}` : 'Configuration';
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
        item.iconPath = new vscode.ThemeIcon('gear');
        item.tooltip = 'Current RebuildRadar settings (right-click folders/files to change)';
        item.description = projectFile ? '' : '(click to expand)';
        return item;
    }

    private buildConfigDetailItem(el: ConfigDetailElement): vscode.TreeItem {
        const item = new vscode.TreeItem(
            `${el.label}: ${el.value}`,
            vscode.TreeItemCollapsibleState.None,
        );
        item.iconPath = new vscode.ThemeIcon('settings-gear');
        item.tooltip = `${el.label}: ${el.value}\n\nRight-click folders or project files in the Explorer to change.`;
        item.command = {
            command: 'workbench.action.openSettings',
            title: 'Open Settings',
            arguments: [`rebuildRadar.${el.label === 'Project' ? 'projectFile' : el.label === 'Include' ? 'includePaths' : el.label === 'Exclude' ? 'excludePaths' : 'moduleDetection'}`],
        };
        return item;
    }

    private buildLoadingItem(el: LoadingElement): vscode.TreeItem {
        const item = new vscode.TreeItem(
            el.message || 'Analysing…',
            vscode.TreeItemCollapsibleState.None,
        );
        item.iconPath = new vscode.ThemeIcon('loading~spin');
        item.tooltip = 'Impact analysis is in progress…';
        return item;
    }

    private buildSummaryItem(el: SummaryElement): vscode.TreeItem {
        const r = el.report;
        const pct = r.globalImpactPercentage.toFixed(1);
        const label = `Overall Impact: ${pct}%`;
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        const modulePart = r.totalModules > 0
            ? ` · ${r.affectedModuleCount}/${r.totalModules} libs`
            : '';
        item.description = `${r.totalAffectedFiles} / ${r.totalProjectFiles} files${modulePart}`;
        item.iconPath = this.impactIcon(r.globalImpactPercentage);
        const tooltipLines = [
            `${r.commitImpacts.length} incoming commit(s)`,
            `${r.totalAffectedFiles} files affected out of ${r.totalProjectFiles}`,
        ];
        if (r.totalModules > 0) {
            tooltipLines.push(`${r.affectedModuleCount} of ${r.totalModules} modules/libraries affected`);
        }
        item.tooltip = tooltipLines.join('\n');
        item.command = {
            command: 'rebuildRadar.showReport',
            title: 'Show Detailed Report',
        };
        return item;
    }

    private buildModuleSectionItem(el: ModuleSectionElement): vscode.TreeItem {
        const r = el.report;
        const label = `Modules: ${r.affectedModuleCount} / ${r.totalModules} affected`;
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
        item.iconPath = new vscode.ThemeIcon('library');
        item.tooltip = `${r.affectedModuleCount} of ${r.totalModules} detected modules would need to rebuild`;
        return item;
    }

    private buildModuleItem(el: ModuleElement): vscode.TreeItem {
        const m = el.module;
        const pct = m.totalFiles > 0 ? ((m.affectedFiles / m.totalFiles) * 100) : 0;
        const label = m.moduleName;
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
        item.description = `${m.affectedFiles}/${m.totalFiles} files (${pct.toFixed(1)}%)`;
        item.iconPath = this.impactIcon(pct);
        item.tooltip = [
            `Module: ${m.moduleName}`,
            `Type  : ${m.moduleType}`,
            `Path  : ${m.modulePath}`,
            `Files : ${m.affectedFiles} affected / ${m.totalFiles} total`,
        ].join('\n');
        return item;
    }

    private buildCommitItem(el: CommitElement): vscode.TreeItem {
        const c = el.impact.commit;
        const label = `${c.hash}  ${c.message}`;
        const item = new vscode.TreeItem(
            label,
            vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.description = `${el.impact.impactPercentage.toFixed(1)}% impact`;
        item.tooltip = [
            `Author : ${c.author}`,
            `Date   : ${c.date}`,
            `Changed: ${c.affectedFiles.length} file(s)`,
            `Rebuild: ${el.impact.rebuildFiles.length} file(s)`,
        ].join('\n');
        item.iconPath = this.impactIcon(el.impact.impactPercentage);
        return item;
    }

    private buildFileItem(el: FileElement): vscode.TreeItem {
        const fileName = path.basename(el.filePath);
        const item = new vscode.TreeItem(
            fileName,
            vscode.TreeItemCollapsibleState.None,
        );
        item.description = el.filePath;
        item.tooltip = `${el.filePath}\nChange: ${el.changeType}`;
        item.iconPath = this.changeIcon(el.changeType);
        return item;
    }

    // ── Icons ────────────────────────────────────────────────────────

    private impactIcon(pct: number): vscode.ThemeIcon {
        if (pct >= IMPACT_THRESHOLDS.HIGH) {
            return new vscode.ThemeIcon(
                'warning',
                new vscode.ThemeColor('errorForeground'),
            );
        }
        if (pct >= IMPACT_THRESHOLDS.MEDIUM) {
            return new vscode.ThemeIcon(
                'warning',
                new vscode.ThemeColor('editorWarning.foreground'),
            );
        }
        if (pct > 0) {
            return new vscode.ThemeIcon(
                'info',
                new vscode.ThemeColor('editorInfo.foreground'),
            );
        }
        return new vscode.ThemeIcon(
            'check',
            new vscode.ThemeColor('testing.iconPassed'),
        );
    }

    private changeIcon(changeType: string): vscode.ThemeIcon {
        switch (changeType) {
            case 'added':
                return new vscode.ThemeIcon(
                    'diff-added',
                    new vscode.ThemeColor('gitDecoration.addedResourceForeground'),
                );
            case 'deleted':
                return new vscode.ThemeIcon(
                    'diff-removed',
                    new vscode.ThemeColor('gitDecoration.deletedResourceForeground'),
                );
            case 'renamed':
                return new vscode.ThemeIcon(
                    'diff-renamed',
                    new vscode.ThemeColor('gitDecoration.renamedResourceForeground'),
                );
            default:
                return new vscode.ThemeIcon(
                    'diff-modified',
                    new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'),
                );
        }
    }
}