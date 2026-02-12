import * as vscode from 'vscode';
import { ImpactReport } from '../models/impactReport';

/**
 * Full-page webview panel that renders a detailed HTML impact report.
 * Opened by clicking the summary node or running "Show Detailed Impact Report".
 */
export class ImpactReportPanel {
    private static currentPanel: ImpactReportPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private report: ImpactReport;

    private constructor(
        panel: vscode.WebviewPanel,
        _extensionUri: vscode.Uri,
        report: ImpactReport,
    ) {
        this.panel = panel;
        this.report = report;
        this.panel.onDidDispose(() => {
            ImpactReportPanel.currentPanel = undefined;
        });
        this.update();
    }

    public static render(extensionUri: vscode.Uri, report: ImpactReport): void {
        if (ImpactReportPanel.currentPanel) {
            ImpactReportPanel.currentPanel.report = report;
            ImpactReportPanel.currentPanel.update();
            ImpactReportPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
        } else {
            const panel = vscode.window.createWebviewPanel(
                'rebuildRadar',
                'RebuildRadar Report',
                vscode.ViewColumn.One,
                { enableScripts: false },
            );
            ImpactReportPanel.currentPanel = new ImpactReportPanel(
                panel,
                extensionUri,
                report,
            );
        }
    }

    // ── Private ──────────────────────────────────────────────────────

    private update(): void {
        this.panel.webview.html = this.buildHtml();
    }

    private color(pct: number): string {
        if (pct >= 50) { return '#e74c3c'; }
        if (pct >= 30) { return '#e67e22'; }
        if (pct >= 10) { return '#f1c40f'; }
        return '#2ecc71';
    }

    private esc(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    private buildHtml(): string {
        const r = this.report;
        const globalColor = this.color(r.globalImpactPercentage);

        // ── Module section ───────────────────────────────────────
        const moduleSection = r.totalModules > 0 ? this.buildModuleSection(r) : '';

        // ── Commit rows ──────────────────────────────────────────
        const rows = r.commitImpacts
            .map((ci) => {
                const c = ci.commit;
                const barColor = this.color(ci.impactPercentage);
                const files = c.affectedFiles
                    .map(
                        (f) =>
                            `<span class="badge ${f.changeType}">${f.changeType[0].toUpperCase()}</span> ${this.esc(f.filePath)}`,
                    )
                    .join('<br/>');

                const moduleBadges = ci.affectedModules
                    .map((m) => `<span class="mod-badge">${this.esc(m.moduleName)}</span>`)
                    .join(' ');

                return `<tr>
                    <td><code>${this.esc(c.hash)}</code></td>
                    <td>${this.esc(c.message)}</td>
                    <td>${this.esc(c.author)}</td>
                    <td>
                        <div class="bar-wrap">
                            <div class="bar" style="width:${Math.min(ci.impactPercentage, 100)}%;background:${barColor}"></div>
                            <span class="bar-txt">${ci.impactPercentage.toFixed(1)}%</span>
                        </div>
                    </td>
                    <td>${ci.rebuildFiles.length}</td>
                    <td>${moduleBadges || '—'}</td>
                    <td class="files">${files}</td>
                </tr>`;
            })
            .join('');

        const moduleSummaryLine = r.totalModules > 0
            ? `${r.affectedModuleCount} of ${r.totalModules} modules / libraries affected<br/>`
            : '';

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Impact Report</title>
<style>
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:20px}
h1{border-bottom:1px solid var(--vscode-panel-border);padding-bottom:10px}
h2{margin-top:30px}
.summary{background:var(--vscode-editor-inactiveSelectionBackground);padding:20px;border-radius:8px;margin:20px 0;display:flex;align-items:center;gap:30px}
.pct{font-size:48px;font-weight:bold}
.details{font-size:14px;line-height:1.8}
.bar-wrap{position:relative;background:var(--vscode-progressBar-background);border-radius:4px;height:20px;min-width:100px}
.bar{height:100%;border-radius:4px}
.bar-txt{position:absolute;top:0;left:50%;transform:translateX(-50%);font-size:11px;line-height:20px;font-weight:bold;color:#fff;text-shadow:0 0 2px rgba(0,0,0,.5)}
table{width:100%;border-collapse:collapse;margin-top:12px}
th{text-align:left;padding:8px 12px;background:var(--vscode-editor-inactiveSelectionBackground);border-bottom:2px solid var(--vscode-panel-border)}
td{padding:8px 12px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:top}
tr:hover{background:var(--vscode-list-hoverBackground)}
code{background:var(--vscode-textCodeBlock-background);padding:2px 6px;border-radius:3px;font-size:12px}
.badge{display:inline-block;width:16px;height:16px;text-align:center;font-size:10px;font-weight:bold;color:#fff;border-radius:3px;margin-right:4px;line-height:16px}
.badge.modified{background:#e67e22}
.badge.added{background:#2ecc71}
.badge.deleted{background:#e74c3c}
.badge.renamed{background:#3498db}
.badge.rebuild{background:#9b59b6}
.mod-badge{display:inline-block;padding:2px 8px;font-size:11px;border-radius:3px;margin:1px 3px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.mod-type{font-size:11px;opacity:.7;text-transform:uppercase}
.files{font-size:12px}
</style>
</head>
<body>
<h1>RebuildRadar Report</h1>

<div class="summary">
  <div class="pct" style="color:${globalColor}">${r.globalImpactPercentage.toFixed(1)}%</div>
  <div class="details">
    <strong>Overall Rebuild Impact</strong><br/>
    ${r.totalAffectedFiles} files would need to rebuild<br/>
    ${r.totalProjectFiles} total project files<br/>
    ${moduleSummaryLine}
    ${r.commitImpacts.length} incoming commit(s)
  </div>
</div>

${moduleSection}

<h2>Commits</h2>
<table>
<thead><tr>
  <th>Hash</th><th>Message</th><th>Author</th><th>Impact</th><th>Rebuild</th><th>Modules</th><th>Changed Files</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
</body>
</html>`;
    }

    private buildModuleSection(r: ImpactReport): string {
        const moduleRows = r.moduleImpacts
            .map((m) => {
                const pct = m.totalFiles > 0 ? ((m.affectedFiles / m.totalFiles) * 100) : 0;
                const barColor = this.color(pct);
                return `<tr>
                    <td><strong>${this.esc(m.moduleName)}</strong></td>
                    <td><span class="mod-type">${this.esc(m.moduleType)}</span></td>
                    <td>${this.esc(m.modulePath)}</td>
                    <td>${m.affectedFiles} / ${m.totalFiles}</td>
                    <td>
                        <div class="bar-wrap">
                            <div class="bar" style="width:${Math.min(pct, 100)}%;background:${barColor}"></div>
                            <span class="bar-txt">${pct.toFixed(1)}%</span>
                        </div>
                    </td>
                </tr>`;
            })
            .join('');

        return `
<h2>Affected Modules / Libraries</h2>
<table>
<thead><tr>
  <th>Module</th><th>Type</th><th>Path</th><th>Files Affected</th><th>Impact</th>
</tr></thead>
<tbody>${moduleRows}</tbody>
</table>`;
    }
}