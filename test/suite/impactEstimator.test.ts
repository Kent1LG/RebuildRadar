import * as assert from 'assert';
import { ImpactEstimator } from '../../src/analysis/impactEstimator';

describe('ImpactEstimator', () => {
    it('should return 0 when totalCount is 0', () => {
        const result = ImpactEstimator.calculatePercentage(0, 0);
        assert.strictEqual(result, 0);
    });

    it('should return 0 when no files are affected', () => {
        const result = ImpactEstimator.calculatePercentage(0, 100);
        assert.strictEqual(result, 0);
    });

    it('should return 100 when all files are affected', () => {
        const result = ImpactEstimator.calculatePercentage(100, 100);
        assert.strictEqual(result, 100);
    });

    it('should return a percentage rounded to one decimal place', () => {
        const result = ImpactEstimator.calculatePercentage(1, 3);
        assert.strictEqual(result, 33.3);
    });

    it('should handle small fractions correctly', () => {
        const result = ImpactEstimator.calculatePercentage(1, 1000);
        assert.strictEqual(result, 0.1);
    });

    it('should calculate cumulative impact across multiple commits', () => {
        const commit1Affected = 5;
        const commit2Affected = 10;
        const totalFiles = 100;

        const impact1 = ImpactEstimator.calculatePercentage(commit1Affected, totalFiles);
        const impact2 = ImpactEstimator.calculatePercentage(commit2Affected, totalFiles);

        assert.ok(impact1 > 0);
        assert.ok(impact2 > impact1);
        assert.ok(impact2 <= 100);
    });
});
