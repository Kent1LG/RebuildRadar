import * as vscode from 'vscode';
import { CommitInfo } from '../models/commitInfo';

export class CommitPickerView {
    private panel: vscode.WebviewPanel | undefined;
    private commits: CommitInfo[] = [];

    constructor() {
        this.createPanel();
    }

    private createPanel() {
        this.panel = vscode.window.createWebviewPanel(
            'commitPicker',
            'Select Commits',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
            }
        );

        this.panel.webview.html = this.getWebviewContent();
        this.panel.onDidDispose(() => this.panel = undefined);
    }

    public setCommits(commits: CommitInfo[]) {
        this.commits = commits;
        if (this.panel) {
            this.panel.webview.html = this.getWebviewContent();
        }
    }

    private getWebviewContent(): string {
        const commitList = this.commits.map(commit => 
            `<li>${commit.hash}: ${commit.message}</li>`
        ).join('');

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Select Commits</title>
            </head>
            <body>
                <h1>Select Commits to Analyze</h1>
                <ul>
                    ${commitList}
                </ul>
            </body>
            </html>
        `;
    }
}