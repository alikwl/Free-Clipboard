#!/usr/bin/env python3
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Fetch open issues from a GitHub repository using the REST API.

Usage:
    python fetch_issues.py --repo owner/repo --workspace ./workspace

Output:
    {workspace}/data/github-issues.md
"""

import argparse
import json
import os
import time
import urllib.request
from datetime import datetime


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Repo-Maintainer/1.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode())


def main():
    parser = argparse.ArgumentParser(description="Fetch GitHub issues")
    parser.add_argument("--repo", required=True, help="GitHub repo (owner/repo)")
    parser.add_argument("--workspace", default="workspace", help="Workspace directory")
    parser.add_argument("--limit", type=int, default=10, help="Number of issues to fetch")
    args = parser.parse_args()

    out_dir = os.path.join(args.workspace, "data")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "github-issues.md")

    # Handle full URL if provided
    repo = args.repo
    if "github.com/" in repo:
        repo = repo.split("github.com/")[-1].strip("/")

    url = f"https://api.github.com/repos/{repo}/issues?state=open&per_page={args.limit}"

    print(f"=== Repo Maintainer: Fetching Issues for {repo} ===")
    print(f"URL: {url}")

    try:
        issues = fetch_json(url)
        print(f"Found {len(issues)} open issues.")

        lines = [f"# Open Issues for {repo} — {datetime.now().strftime('%B %d, %Y')}\n"]

        for idx, issue in enumerate(issues, 1):
            title = issue.get("title", "Untitled")
            number = issue.get("number", 0)
            url = issue.get("html_url", "")
            body = issue.get("body", "") or "No description."
            user = issue.get("user", {}).get("login", "anon")
            comments_count = issue.get("comments", 0)

            # Skip pull requests (they show up in the issues API)
            if "pull_request" in issue:
                continue

            print(f"  #{number}: {title}")

            lines.append(f"## #{number} {title}")
            lines.append(f"- **URL**: {url}")
            lines.append(f"- **Author**: {user} | **Comments**: {comments_count}\n")
            lines.append(f"### Description\n")
            # Truncate long bodies
            lines.append(body[:1000] + ("..." if len(body) > 1000 else ""))
            lines.append("\n---\n")

        with open(out_path, "w") as f:
            f.write("\n".join(lines))

        print(f"\n✅ Issues saved to {out_path}")

    except Exception as e:
        print(f"\n❌ Failed to fetch issues: {e}")
        print("Note: Public API may be rate limited.")


if __name__ == "__main__":
    main()
