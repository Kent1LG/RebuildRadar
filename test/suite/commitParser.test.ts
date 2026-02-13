import * as assert from 'assert';
import { CommitParser } from '../../src/git/commitParser';
import { CommitInfo } from '../../src/models/commitInfo';
import { FileChange } from '../../src/models/fileChange';

describe('CommitParser', () => {
    it('should convert raw commit data to CommitInfo', () => {
        const rawCommit = {
            hash: 'abcdef1234567890abcdef1234567890abcdef12',
            message: 'Fix rendering bug',
            author: 'Test Author',
            date: '2026-01-15 10:30:00 +0000',
        };
        const files: FileChange[] = [
            { filePath: 'Source/Renderer/Draw.cpp', changeType: 'modified' },
        ];

        const result = CommitParser.toCommitInfo(rawCommit, files);

        assert.strictEqual(result.hash, 'abcdef12');
        assert.strictEqual(result.fullHash, rawCommit.hash);
        assert.strictEqual(result.message, 'Fix rendering bug');
        assert.strictEqual(result.author, 'Test Author');
        assert.strictEqual(result.date, '2026-01-15 10:30:00 +0000');
        assert.deepStrictEqual(result.affectedFiles, files);
    });

    it('should truncate hash to 8 characters', () => {
        const rawCommit = {
            hash: '1234567890abcdef1234567890abcdef12345678',
            message: 'Some commit',
            author: 'Author',
            date: '2026-01-01',
        };

        const result = CommitParser.toCommitInfo(rawCommit, []);

        assert.strictEqual(result.hash.length, 8);
        assert.strictEqual(result.hash, '12345678');
    });

    it('should handle empty file list', () => {
        const rawCommit = {
            hash: 'abcdef1234567890abcdef1234567890abcdef12',
            message: 'Empty commit',
            author: 'Author',
            date: '2026-01-01',
        };

        const result = CommitParser.toCommitInfo(rawCommit, []);

        assert.deepStrictEqual(result.affectedFiles, []);
    });
});
