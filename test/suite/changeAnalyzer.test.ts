import { ChangeAnalyzer } from '../../src/analysis/changeAnalyzer';
import { CommitInfo } from '../../src/models/commitInfo';
import { FileChange } from '../../src/models/fileChange';

describe('ChangeAnalyzer', () => {
    let changeAnalyzer: ChangeAnalyzer;

    beforeEach(() => {
        changeAnalyzer = new ChangeAnalyzer();
    });

    it('should analyze a single commit with no changes', () => {
        const commit: CommitInfo = {
            hash: 'abc123',
            message: 'No changes',
            affectedFiles: []
        };

        const result = changeAnalyzer.analyzeCommit(commit);
        expect(result).toEqual({
            affectedModules: [],
            impactPercentage: 0
        });
    });

    it('should analyze a commit with modified files', () => {
        const commit: CommitInfo = {
            hash: 'def456',
            message: 'Modified some files',
            affectedFiles: [
                { path: 'Source/SomeModule/SomeFile.cpp', type: 'modified' }
            ] as FileChange[]
        };

        const result = changeAnalyzer.analyzeCommit(commit);
        expect(result).toEqual({
            affectedModules: ['SomeModule'],
            impactPercentage: expect.any(Number) // Replace with actual expected value if known
        });
    });

    it('should analyze a commit with added files', () => {
        const commit: CommitInfo = {
            hash: 'ghi789',
            message: 'Added new feature',
            affectedFiles: [
                { path: 'Source/NewModule/NewFile.cpp', type: 'added' }
            ] as FileChange[]
        };

        const result = changeAnalyzer.analyzeCommit(commit);
        expect(result).toEqual({
            affectedModules: ['NewModule'],
            impactPercentage: expect.any(Number) // Replace with actual expected value if known
        });
    });

    it('should handle multiple affected files', () => {
        const commit: CommitInfo = {
            hash: 'jkl012',
            message: 'Multiple changes',
            affectedFiles: [
                { path: 'Source/ModuleA/FileA.cpp', type: 'modified' },
                { path: 'Source/ModuleB/FileB.cpp', type: 'deleted' }
            ] as FileChange[]
        };

        const result = changeAnalyzer.analyzeCommit(commit);
        expect(result).toEqual({
            affectedModules: ['ModuleA', 'ModuleB'],
            impactPercentage: expect.any(Number) // Replace with actual expected value if known
        });
    });
});