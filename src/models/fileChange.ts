export type ChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

export interface FileChange {
    filePath: string;
    changeType: ChangeType;
}