import * as assert from 'assert';
import { FileChange, ChangeType } from '../../src/models/fileChange';
import { CommitInfo } from '../../src/models/commitInfo';

describe('Models', () => {
    describe('FileChange', () => {
        it('should represent a modified file', () => {
            const change: FileChange = {
                filePath: 'Source/Engine/Renderer.cpp',
                changeType: 'modified',
            };
            assert.strictEqual(change.filePath, 'Source/Engine/Renderer.cpp');
            assert.strictEqual(change.changeType, 'modified');
        });

        it('should support all change types', () => {
            const types: ChangeType[] = ['added', 'modified', 'deleted', 'renamed'];
            for (const t of types) {
                const change: FileChange = { filePath: 'test.cpp', changeType: t };
                assert.strictEqual(change.changeType, t);
            }
        });
    });

    describe('CommitInfo', () => {
        it('should hold commit metadata and affected files', () => {
            const files: FileChange[] = [
                { filePath: 'Source/Module/File.cpp', changeType: 'modified' },
                { filePath: 'Source/Module/File.h', changeType: 'modified' },
            ];
            const commit: CommitInfo = {
                hash: 'abcdef12',
                fullHash: 'abcdef1234567890abcdef1234567890abcdef12',
                message: 'Update module',
                author: 'Dev',
                date: '2026-02-13',
                affectedFiles: files,
            };

            assert.strictEqual(commit.hash, 'abcdef12');
            assert.strictEqual(commit.affectedFiles.length, 2);
        });

        it('should allow empty affected files', () => {
            const commit: CommitInfo = {
                hash: '00000000',
                fullHash: '0000000000000000000000000000000000000000',
                message: 'Empty',
                author: 'Dev',
                date: '2026-01-01',
                affectedFiles: [],
            };

            assert.deepStrictEqual(commit.affectedFiles, []);
        });
    });
});
