import { FileChange } from './fileChange';

export interface CommitInfo {
    hash: string;
    fullHash: string;
    message: string;
    author: string;
    date: string;
    affectedFiles: FileChange[];
}