import { GitService } from '../../src/git/gitService';
import { CommitParser } from '../../src/git/commitParser';
import { ChangeAnalyzer } from '../../src/analysis/changeAnalyzer';
import { ImpactEstimator } from '../../src/analysis/impactEstimator';
import { CommitInfo } from '../../src/models/commitInfo';
import { FileChange } from '../../src/models/fileChange';

describe('GitService', () => {
    let gitService: GitService;
    let commitParser: CommitParser;
    let changeAnalyzer: ChangeAnalyzer;
    let impactEstimator: ImpactEstimator;

    beforeEach(() => {
        gitService = new GitService();
        commitParser = new CommitParser();
        changeAnalyzer = new ChangeAnalyzer();
        impactEstimator = new ImpactEstimator();
    });

    it('should fetch commit history and analyze changes', async () => {
        const commits: CommitInfo[] = await gitService.fetchCommitHistory();
        const changes: FileChange[] = commitParser.parseCommits(commits);
        const affectedModules = changeAnalyzer.analyzeChanges(changes);
        const impactPercentage = impactEstimator.estimateImpact(affectedModules);

        expect(commits).toBeDefined();
        expect(changes).toBeDefined();
        expect(affectedModules).toBeDefined();
        expect(impactPercentage).toBeGreaterThan(0);
    });

    it('should handle no changes gracefully', async () => {
        const commits: CommitInfo[] = await gitService.fetchCommitHistory();
        const changes: FileChange[] = commitParser.parseCommits(commits);
        
        // Simulate no changes
        const affectedModules = changeAnalyzer.analyzeChanges([]);
        const impactPercentage = impactEstimator.estimateImpact(affectedModules);

        expect(impactPercentage).toBe(0);
    });
});