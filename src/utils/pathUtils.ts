import * as path from 'path';

const CPP_SOURCE_EXTENSIONS = new Set([
    '.cpp', '.cc', '.cxx', '.c',
    '.h', '.hpp', '.hxx', '.hh',
    '.inl', '.ipp',
]);

const HEADER_EXTENSIONS = new Set([
    '.h', '.hpp', '.hxx', '.hh', '.inl', '.ipp',
]);

export function isCppFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return CPP_SOURCE_EXTENSIONS.has(ext);
}

export function isHeaderFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return HEADER_EXTENSIONS.has(ext);
}

export function normalizePath(p: string): string {
    return p.replace(/\\/g, '/');
}

export function getRelativePath(basePath: string, targetPath: string): string {
    return normalizePath(path.relative(basePath, targetPath));
}