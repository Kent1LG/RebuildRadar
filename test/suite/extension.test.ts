import { expect } from 'chai';
import { analyzeCommits } from '../../src/commands/analyzeCommits';
import { GitService } from '../../src/git/gitService';
import { ImpactEstimator } from '../../src/analysis/impactEstimator';
import { ChangeAnalyzer } from '../../src/analysis/changeAnalyzer';

describe('Extension Tests', () => {
    let gitService: GitService;
    let impactEstimator: ImpactEstimator;
    let changeAnalyzer: ChangeAnalyzer;

    beforeEach(() => {
        gitService = new GitService();
        impactEstimator = new ImpactEstimator();
        changeAnalyzer = new ChangeAnalyzer();
    });

    it('should analyze commits and estimate impact', async () => {
        const commits = await gitService.getCommitHistory();
        const changes = await changeAnalyzer.analyzeCommits(commits);
        const impactReport = impactEstimator.estimateImpact(changes);

        expect(impactReport).to.have.property('affectedModules');
        expect(impactReport).to.have.property('impactPercentage');
        expect(impactReport.impactPercentage).to.be.a('number');
    });

    it('should handle no commits gracefully', async () => {
        const commits = [];
        const changes = await changeAnalyzer.analyzeCommits(commits);
        const impactReport = impactEstimator.estimateImpact(changes);

        expect(impactReport).to.deep.equal({
            affectedModules: [],
            impactPercentage: 0
        });
    });

    // Additional tests can be added here
});