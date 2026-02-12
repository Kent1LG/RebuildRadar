/**
 * Simple stateless helper for impact percentage calculation.
 */
export class ImpactEstimator {
    /** Returns a percentage rounded to one decimal place. */
    static calculatePercentage(affectedCount: number, totalCount: number): number {
        if (totalCount === 0) {
            return 0;
        }
        return Math.round((affectedCount / totalCount) * 1000) / 10;
    }
}