import * as assert from 'assert';
import { ImpactEstimator } from '../../src/analysis/impactEstimator';
import { CommitParser } from '../../src/git/commitParser';
import { FileChange } from '../../src/models/fileChange';

describe('Extension Integration', () => {
    it('should wire ImpactEstimator and CommitParser together', () => {
        const rawCommit = {
            hash: 'abcdef1234567890abcdef1234567890abcdef12',
            message: 'Changed renderer',
            author: 'Dev',
            date: '2026-02-13',
        };
        const files: FileChange[] = [
            { filePath: 'Source/Renderer/Draw.cpp', changeType: 'modified' },
            { filePath: 'Source/Renderer/Draw.h', changeType: 'modified' },
        ];

        const commit = CommitParser.toCommitInfo(rawCommit, files);
        assert.strictEqual(commit.affectedFiles.length, 2);

        // Simulate: 2 files affected out of 50 total project files
        const impact = ImpactEstimator.calculatePercentage(commit.affectedFiles.length, 50);
        assert.strictEqual(impact, 4);
        assert.ok(impact > 0);
        assert.ok(impact <= 100);
    });

    it('should handle zero affected files', () => {
        const rawCommit = {
            hash: 'abcdef1234567890abcdef1234567890abcdef12',
            message: 'Docs only',
            author: 'Dev',
            date: '2026-02-13',
        };

        const commit = CommitParser.toCommitInfo(rawCommit, []);
        assert.strictEqual(commit.affectedFiles.length, 0);

        const impact = ImpactEstimator.calculatePercentage(0, 50);
        assert.strictEqual(impact, 0);
    });
});
