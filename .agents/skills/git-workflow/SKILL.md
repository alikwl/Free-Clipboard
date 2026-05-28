---
name: git-workflow
description: Guides the agent on how to handle git operations and generate .patch files instead of submitting PRs.
---

# Git Workflow Skill

This skill provides guidelines for interacting with the Git repository and generating patches.

## Steps
1. **Clone Repository**: `git clone https://github.com/<owner>/<repo>.git`
2. **Make Changes**: Edit files in the cloned repository.
3. **Generate Patch**:
   - For a simple diff: `git diff > ../output/fix.patch`
   - For a proper commit-based patch:
     ```bash
     git add .
     git commit -m "Fix: describe the fix"
     git format-patch -1 HEAD --output-directory=../output/
     ```

## Rules
- **CRITICAL**: Do NOT push to remote branches.
- **CRITICAL**: Do NOT attempt to create Pull Requests or use GitHub CLI (`gh`).
- Always verify your changes locally before generating the patch.
- Save all generated patches to `{workspace}/output/`.
