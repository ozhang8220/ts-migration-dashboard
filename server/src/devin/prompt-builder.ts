interface FileInfo {
  path: string;
  loc: number;
  complexity: string;
  importedBy: number;
  depDepth: number;
}

interface PromptConfig {
  repoFullName: string;
  baseBranch: string;
  alreadyConverted: string[];
}

export function buildMigrationPrompt(file: FileInfo, config: PromptConfig): string {
  const extension = file.path.endsWith('.jsx') || file.path.endsWith('.tsx') ? '.tsx' : '.ts';
  const newPath = file.path.replace(/\.(js|jsx|ts|tsx)$/, extension);
  const branchName = `ts-migrate/${file.path.replace(/\//g, '-').replace(/\.(js|jsx)$/, '')}`;

  const alreadyConvertedSection = config.alreadyConverted.length > 0
    ? `\nAlready converted files (for import reference):\n${config.alreadyConverted.map(f => `  - ${f}`).join('\n')}`
    : '\nNo files have been converted yet.';

  const highComplexityGuidance = file.complexity === 'high'
    ? `
## High Complexity File Guidance
This file is marked as HIGH complexity. Special rules apply:
- Use \`unknown\` instead of \`any\` wherever the type is uncertain, then narrow with type guards
- If a section is too complex to type safely, add a \`// TODO(ts-migration): [description]\` comment explaining what needs manual review
- Partial conversion with TODO comments is PREFERRED over using \`any\` types
- Focus on getting the most important types right; leave edge cases with TODO comments
- Do NOT spend excessive time on dynamic patterns (event registries, plugin systems, etc.) — mark them with TODOs
`
    : '';

  return `## Task
Convert the following JavaScript file to TypeScript in the repository \`${config.repoFullName}\`.

**File to convert:** \`${file.path}\`
**Target path:** \`${newPath}\`

## File Context
- Lines of code: ${file.loc}
- Complexity: ${file.complexity}
- Imported by ${file.importedBy} other file(s)
- Dependency depth: ${file.depDepth}
${alreadyConvertedSection}

## Conversion Standards
1. Rename \`${file.path}\` → \`${newPath}\`
2. Add explicit TypeScript types to all function parameters, return types, and variables
3. Zero \`any\` types — use proper types, \`unknown\`, or generics instead
4. NO logic changes — the runtime behavior must be identical
5. NO new dependencies — only use existing packages and their @types equivalents
6. NO changes to build config (tsconfig, webpack, vite, etc.)
7. NO test file changes — only convert the source file
8. Update imports in other files that reference this module if the extension changed
${highComplexityGuidance}
## Verification
After conversion, run:
\`\`\`bash
npx tsc --noEmit
npm test
\`\`\`
Both must pass with zero errors.

## Pull Request
- **Branch name:** \`${branchName}\`
- **Base branch:** \`${config.baseBranch}\`
- **PR title:** \`chore(ts-migration): convert ${file.path} to TypeScript\`
- **Labels:** \`ts-migration\`, \`automated\`

### PR Description Template
\`\`\`markdown
## TypeScript Migration: \`${file.path}\`

| Property | Value |
|----------|-------|
| Original file | \`${file.path}\` |
| New file | \`${newPath}\` |
| LOC | ${file.loc} |
| Complexity | ${file.complexity} |

### What Changed
- Renamed file from .js/.jsx to .ts/.tsx
- Added explicit TypeScript type annotations
- [List specific type additions]

### Verification
\\\`\\\`\\\`
npx tsc --noEmit  # ✅ Pass
npm test          # ✅ Pass
\\\`\\\`\\\`

### Safety Checklist
- [ ] No runtime behavior changes
- [ ] No \`any\` types used
- [ ] All function parameters have explicit types
- [ ] All return types are annotated
- [ ] No new dependencies added
- [ ] tsc --noEmit passes
- [ ] npm test passes
\`\`\`
`;
}
