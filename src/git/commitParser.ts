import { CommitInfo } from '../models/commitInfo';
import { FileChange } from '../models/fileChange';

export class CommitParser {
    /**
     * Convert raw git log data + file list into a CommitInfo object.
     */
    public static toCommitInfo(
        rawCommit: { hash: string; message: string; author: string; date: string },
        files: FileChange[],
    ): CommitInfo {
        return {
            hash: rawCommit.hash.substring(0, 8),
            fullHash: rawCommit.hash,
            message: rawCommit.message,
            author: rawCommit.author,
            date: rawCommit.date,
            affectedFiles: files,
        };
    }
}