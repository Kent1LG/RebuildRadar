import simpleGit, { SimpleGit } from 'simple-git';
import { FileChange, ChangeType } from '../models/fileChange';

export class GitService {
    private git: SimpleGit;
    private repoPath: string;

    constructor(repositoryPath: string) {
        this.repoPath = repositoryPath;
        this.git = simpleGit(repositoryPath);
    }

    async getCurrentBranch(): Promise<string> {
        const result = await this.git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
        return result.trim();
    }

    async getTrackingBranch(): Promise<string | null> {
        try {
            const result = await this.git.raw([
                'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}',
            ]);
            return result.trim() || null;
        } catch {
            return null;
        }
    }

    async fetch(): Promise<void> {
        await this.git.fetch();
    }

    /**
     * Returns commits that exist on trackingBranch but not on HEAD.
     * These are the commits that would be pulled.
     */
    async getCommitsAhead(
        trackingBranch: string,
    ): Promise<{ hash: string; message: string; author: string; date: string }[]> {
        try {
            const result = await this.git.raw([
                'log',
                '--pretty=format:%H|||%s|||%an|||%ai',
                `HEAD..${trackingBranch}`,
            ]);
            if (!result.trim()) {
                return [];
            }
            return result
                .trim()
                .split('\n')
                .map((line) => {
                    const [hash, message, author, date] = line.split('|||');
                    return { hash, message, author, date };
                });
        } catch {
            return [];
        }
    }

    /** Get files changed in a specific commit. */
    async getCommitFiles(commitHash: string): Promise<FileChange[]> {
        try {
            const result = await this.git.raw([
                'diff-tree',
                '--no-commit-id',
                '--name-status',
                '-r',
                commitHash,
            ]);
            if (!result.trim()) {
                return [];
            }
            return result
                .trim()
                .split('\n')
                .filter((l) => l.length > 0)
                .map((line) => {
                    const parts = line.split('\t');
                    const statusChar = parts[0][0];
                    const filePath = parts.length > 2 ? parts[2] : parts[1];
                    let changeType: ChangeType;
                    switch (statusChar) {
                        case 'A':
                            changeType = 'added';
                            break;
                        case 'D':
                            changeType = 'deleted';
                            break;
                        case 'R':
                            changeType = 'renamed';
                            break;
                        default:
                            changeType = 'modified';
                    }
                    return { filePath, changeType };
                });
        } catch {
            return [];
        }
    }

    async getRemoteBranches(): Promise<string[]> {
        try {
            const result = await this.git.raw(['branch', '-r', '--format=%(refname:short)']);
            return result
                .trim()
                .split('\n')
                .filter((b) => b.length > 0 && !b.includes('HEAD'));
        } catch {
            return [];
        }
    }

    async getHeadHash(): Promise<string> {
        const result = await this.git.raw(['rev-parse', 'HEAD']);
        return result.trim();
    }

    /** Count all tracked files in the repo (fallback for non-C++ projects). */
    async getTotalFileCount(): Promise<number> {
        try {
            const result = await this.git.raw(['ls-files']);
            return result
                .trim()
                .split('\n')
                .filter((l) => l.length > 0).length;
        } catch {
            return 0;
        }
    }
}