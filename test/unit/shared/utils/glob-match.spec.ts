import { globMatch } from '../../../../src/shared/utils/glob-match';

describe('globMatch', () => {
    it('matches .cursor/rules/**/*.mdc against rule files in tree', () => {
        const pattern = '.cursor/rules/**/*.mdc';
        expect(globMatch('.cursor/rules/accessibility.mdc', pattern)).toBe(true);
        expect(globMatch('.cursor/rules/animation.mdc', pattern)).toBe(true);
        expect(globMatch('.cursor/rules/assets.mdc', pattern)).toBe(true);
        expect(globMatch('.gitignore', pattern)).toBe(false);
    });

    it('matches nested folders with **', () => {
        const pattern = '.cursor/rules/**/*.mdc';
        expect(globMatch('.cursor/rules/sub/dir/file.mdc', pattern)).toBe(true);
        expect(globMatch('.cursor/rules/subdir/file.txt', pattern)).toBe(false);
    });

    it('matches exact files and directories', () => {
        expect(globMatch('.cursorrules', '.cursorrules')).toBe(true);
        expect(globMatch('CLAUDE.md', 'CLAUDE.md')).toBe(true);
        expect(globMatch('docs/coding-standards/guide.md', 'docs/coding-standards/**/*')).toBe(true);
    });

    it('does not let single * cross directory boundaries', () => {
        expect(globMatch('docs/a.md', 'docs/*')).toBe(true);
        expect(globMatch('docs/a/b.md', 'docs/*')).toBe(false);
    });

    it('supports character class and ? wildcard', () => {
        expect(globMatch('file-a.md', 'file-[ab].md')).toBe(true);
        expect(globMatch('file-b.md', 'file-[ab].md')).toBe(true);
        expect(globMatch('file-c.md', 'file-[ab].md')).toBe(false);
        expect(globMatch('a.md', '?.md')).toBe(true);
        expect(globMatch('ab.md', '?.md')).toBe(false);
    });

    it('supports brace expansion for extensions', () => {
        expect(globMatch('src/app.ts', 'src/**/*.{ts,js}')).toBe(true);
        expect(globMatch('src/app.js', 'src/**/*.{ts,js}')).toBe(true);
        expect(globMatch('src/app.jsx', 'src/**/*.{ts,js}')).toBe(false);
    });

    it('matches dotfiles when pattern includes a dotfile', () => {
        expect(globMatch('.aiderignore', '.aiderignore')).toBe(true);
        expect(globMatch('.aider.conf.yml', '.aider.conf.yml')).toBe(true);
        expect(globMatch('.github/copilot-instructions.md', '.github/copilot-instructions.md')).toBe(true);
    });

    it('normalizes Windows separators in paths and patterns', () => {
        expect(globMatch('dir\\sub\\file.mdc', '**/*.mdc')).toBe(true);
        expect(globMatch('dir/sub/file.mdc', '**\\*.mdc')).toBe(true);
    });

    it('matches more repository rule patterns', () => {
        expect(globMatch('.sourcegraph/rules/one.rule.md', '.sourcegraph/**/*.rule.md')).toBe(true);
        expect(globMatch('.rules/backend/security.md', '.rules/**/*')).toBe(true);
        expect(globMatch('.kody/rules.json', '.kody/**/*')).toBe(true);
        expect(globMatch('.windsurfrules', '.windsurfrules')).toBe(true);
    });
});


