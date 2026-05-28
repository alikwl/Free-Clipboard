---
name: github-researcher
description: Guides the agent on how to read and search GitHub issues to understand the repository's problems.
---

# GitHub Researcher Skill

This skill helps the agent find and understand issues in a specified GitHub repository, and gain a deep understanding of the codebase.

> [!WARNING]
> **GitHub CLI (`gh`) is NOT installed** in this environment. Do NOT attempt to run `gh` commands. Always use the provided `fetch_issues.py` script to batch fetch open issues, and use `curl` with the GitHub REST API to fetch specific issue details or comments.

## Workflow

### 1. Fetching Issues

You can fetch issues using the provided Python script (works without auth for public repos):

```bash
python skills/github-researcher/scripts/fetch_issues.py --repo <owner>/<repo> --workspace ./workspace
```

Output: `{workspace}/data/github-issues.md`

If you need to fetch specific issue details or comments, you can query the GitHub REST API directly using `curl` (since `api.github.com` is in the network allowlist):

#### Fetch Specific Issue Details:
```bash
curl -s -H "User-Agent: Repo-Maintainer/1.0" https://api.github.com/repos/<owner>/<repo>/issues/<issue_number>
```

#### Fetch Comments on a Specific Issue:
```bash
curl -s -H "User-Agent: Repo-Maintainer/1.0" https://api.github.com/repos/<owner>/<repo>/issues/<issue_number>/comments
```

### 3. Understanding the Repo
To answer questions like *"What are my biggest issues?"* or understand the project deeply:
1. **Read the README**: Check the top-level `README.md` in the cloned repo.
2. **Scan the directory tree**: Use `find . -maxdepth 2` to understand the structure.
3. **Summarize issues**: Read the fetched issues and identify themes, recurring complaints, or critical bugs.

## Output

Produce a summary of the top issues and codebase structure to answer the user's high-level questions.
