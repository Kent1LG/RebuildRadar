export const ERROR_MESSAGES = {
    NO_WORKSPACE: 'No workspace folder is open.',
    GIT_NOT_FOUND: 'Could not find a git repository in the workspace.',
    FETCH_FAILED: 'Failed to fetch from remote repository.',
    ANALYSIS_FAILED: 'Failed to analyze rebuild impact.',
    NO_TRACKING_BRANCH: 'No tracking branch found for the current branch.',
};

export const CONFIG = {
    MAX_COMMITS_TO_ANALYZE: 100,
    SCAN_SKIP_DIRS: [
        'node_modules', '.git', 'Binaries', 'Intermediate',
        'DerivedDataCache', 'Saved', '.vs', '.vscode',
        '__pycache__', 'Debug', 'Release', 'x64', 'x86',
        '.idea', 'cmake-build-debug', 'cmake-build-release',
        'build', 'out', 'dist',
    ],
};

export const IMPACT_THRESHOLDS = {
    LOW: 10,
    MEDIUM: 30,
    HIGH: 50,
};