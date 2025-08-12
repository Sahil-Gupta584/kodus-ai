import { isMatch } from 'micromatch';

export function globMatch(path: string, pattern: string): boolean {
    const filePath = String(path || '').replace(/\\/g, '/');
    const glob = String(pattern || '').replace(/\\/g, '/');
    return isMatch(filePath, glob, { dot: true });
}


