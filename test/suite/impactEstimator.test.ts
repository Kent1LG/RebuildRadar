import { ImpactEstimator } from '../../src/analysis/impactEstimator';
import { CommitInfo } from '../../src/models/commitInfo';
import { FileChange } from '../../src/models/fileChange';

describe('ImpactEstimator', () => {
    let impactEstimator: ImpactEstimator;

    beforeEach(() => {
        impactEstimator = new ImpactEstimator();
    });

    it('should calculate impact percentage correctly for modified files', () => {
        const commitInfo: CommitInfo = {
            hash: 'abc123',
            message: 'Modified some files',
            affectedFiles: [
                { path: 'Source/SomeModule/SomeFile.cpp', type: 'modified' },
                { path: 'Source/AnotherModule/AnotherFile.cpp', type: 'modified' }
            ] as FileChange[]
        };

        const impactPercentage = impactEstimator.estimateImpact(commitInfo);
        expect(impactPercentage).toBeGreaterThan(0);
        expect(impactPercentage).toBeLessThanOrEqual(100);
    });

    it('should return 0% impact for commits with no affected files', () => {
        const commitInfo: CommitInfo = {
            hash: 'def456',
            message: 'No changes',
            affectedFiles: []
        };

        const impactPercentage = impactEstimator.estimateImpact(commitInfo);
        expect(impactPercentage).toBe(0);
    });

    it('should handle multiple commits and calculate cumulative impact', () => {
        const commits: CommitInfo[] = [
            {
                hash: 'abc123',
                message: 'Modified some files',
                affectedFiles: [
                    { path: 'Source/SomeModule/SomeFile.cpp', type: 'modified' }
                ] as FileChange[]
            },
            {
                hash: 'def456',
                message: 'Modified another file',
                affectedFiles: [
                    { path: 'Source/AnotherModule/AnotherFile.cpp', type: 'modified' }
                ] as FileChange[]
            }
        ];

        const totalImpact = commits.reduce((acc, commit) => {
            return acc + impactEstimator.estimateImpact(commit);
        }, 0);

        expect(totalImpact).toBeGreaterThan(0);
    });
});