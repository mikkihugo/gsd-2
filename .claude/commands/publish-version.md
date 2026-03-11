---
description: Publish GSD updates to npm and GitHub
---

Publish GSD updates with automatic changelog generation.

<process>

<step name="check_uncommitted">
## 1. Check for Uncommitted Changes

```bash
git status --short
```

If uncommitted changes exist:
- Ask: "Uncommitted changes detected. What commit message should I use?"
- Commit with provided message
- Continue to next step
</step>

<step name="get_commits_since_tag">
## 2. Get Commits Since Last Version

```bash
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  git log ${LAST_TAG}..HEAD --oneline --no-merges
else
  echo "No previous tags found"
fi
```

Capture the commit list for changelog generation.
</step>

<step name="check_docs">
## 3. Check Documentation Currency

Review the commits captured above and check if README.md needs updates.

**Check for commits that require README updates:**
- New commands or features
- Changed command behavior or flags
- New configuration options
- New workflows or processes
- Deprecations or removals

**Review README.md against commits:**
1. Read README.md
2. For each significant commit, verify the feature/change is documented
3. Check command tables match actual commands
4. Check configuration tables match actual options

**If updates needed:**
1. Draft specific README changes
2. Present changes for approval
3. Apply approved changes
4. Commit: `git add README.md && git commit -m "docs: update README for vX.Y.Z"`

**If no updates needed:**
- State: "README is current with all changes"
- Continue to next step
</step>

<step name="generate_changelog_draft">
## 4. Generate Changelog Entry Draft

Analyze the commits and draft a curated changelog entry.

**Grouping rules:**
- **Added** — New features, commands, capabilities
- **Changed** — Modifications to existing behavior
- **Fixed** — Bug fixes
- **Removed** — Deprecated/removed features
- **BREAKING:** prefix for breaking changes

**Writing rules:**
- Write human-readable descriptions, not raw commit messages
- Focus on user impact, not implementation details
- Group related commits into single entries
- Flag breaking changes prominently with **BREAKING:** prefix

**Example draft:**
```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New `/gsd:whats-new` command for version awareness

### Changed
- Improved parallel execution performance

### Fixed
- STATE.md progress bar calculation

### Removed
- **BREAKING:** Removed deprecated ISSUES.md system
```

Present the draft for review.
</step>

<step name="checkpoint_review" type="checkpoint:human-verify">
## 5. Review Changelog Draft

**Drafted changelog entry:**
[Show the generated draft]

**Verify:**
1. Categories are correct (Added/Changed/Fixed/Removed)
2. Descriptions are clear and user-focused
3. Breaking changes are marked with **BREAKING:** prefix
4. Nothing important is missing from commits

**Resume signal:** Type "approved" or provide edits
</step>

<step name="update_changelog">
## 6. Update CHANGELOG.md

After approval:

1. **Read current CHANGELOG.md**
2. **Insert new version section** after [Unreleased] header
3. **Update version links** at bottom:
   - Add new version link: `[X.Y.Z]: https://github.com/gsd-build/gsd-2/releases/tag/vX.Y.Z`
   - Update [Unreleased] comparison: `[Unreleased]: https://github.com/gsd-build/gsd-2/compare/vX.Y.Z...HEAD`

```bash
# Stage changelog
git add CHANGELOG.md
git commit -m "docs: update changelog for vX.Y.Z"
```
</step>

<step name="version_bump">
## 7. Bump Version

Ask which version bump type:
- `npm version patch` — Bug fixes (default)
- `npm version minor` — New features
- `npm version major` — Breaking changes
- `npm version prerelease --preid=alpha` — Experimental features

```bash
npm version patch  # or minor/major/prerelease
```

This creates a version commit and tag.
</step>

<step name="push_and_publish">
## 8. Push and Publish

```bash
git push && git push --tags
```

Then publish to npm:

```bash
npm publish --access public
```

Verify the publish succeeded by checking the output for the package URL.
</step>

<step name="create_github_release">
## 9. Create GitHub Release

Create a GitHub Release from the tag.

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes "[changelog content]" --latest
```

Use the approved changelog content as the release notes.
</step>

<step name="post_discord">
## 10. Post to Discord Changelog

Post the changelog entry to the GSD Discord community.

Use the Discord MCP server:
```
discord_execute("messages.send", {
  "channel_id": "1464128246290579469",
  "content": "**vX.Y.Z Released** \n\n[changelog content here]\n\nInstall/upgrade: `npx gsd-pi@latest`"
})
```

Format the message with:
- Version number as header
- The approved changelog content (Added/Changed/Fixed/Removed sections)
- Install command at the bottom
</step>

<step name="report">
## 11. Report Success

```
Published vX.Y.Z

- npm: https://www.npmjs.com/package/gsd-pi
- GitHub: https://github.com/gsd-build/gsd-2/releases/tag/vX.Y.Z
```
</step>

</process>

<success_criteria>
- README.md checked against commits and updated if needed
- Changelog entry drafted from commits
- User reviewed and approved entry
- CHANGELOG.md updated and committed
- Version bumped via npm version
- Pushed to GitHub with tags
- Published to npm via `npm publish`
- GitHub Release created with `gh release create`
- Changelog posted to Discord #changelog channel
</success_criteria>
