import { SyntaxNode } from 'tree-sitter';
import { FunctionAnalysis } from '../ast/types/types';

export interface ChangeResult {
    added: FunctionResult[];
    modified: FunctionResult[];
    deleted: FunctionResult[];
}

export interface FunctionResult {
    name: string;
    fullName: string;
    functionHash: string;
    signatureHash: string;
    node: SyntaxNode;
    fullText: string;
    lines: number;
}

// Basic interfaces needed
export interface DiffHunk {
    oldStart: number; // Starting line in the old version
    oldCount: number; // Number of lines in the old version
    newStart: number; // Starting line in the new version
    newCount: number; // Number of lines in the new version
    content: string; // Hunk content with +/− markers
}

// Local interface to represent a function with its lines
export interface ExtendedFunctionInfo extends Omit<FunctionAnalysis, 'name'> {
    name: string;
    startLine: number;
    endLine: number;
}
