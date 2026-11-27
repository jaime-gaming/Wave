# Repository metadata review

These are proposed GitHub **About** descriptions and additional topics for the public
`jaime-gaming` repositories. They were reviewed against each repository's public README; they do
not modify those repositories' files or branches. Descriptions and topics are GitHub settings,
not part of this branch, and must be applied by an installation with repository administration
write permission.

| Repository                                                         | Proposed short description                                                                      | Suggested additional topics                                 |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [Wave](https://github.com/jaime-gaming/Wave)                       | A local-first music player for the web, Windows, Android and iOS.                               | `music-player`, `offline-first`, `typescript`, `ios`        |
| [RNGdle-Infinite](https://github.com/jaime-gaming/RNGdle-Infinite) | A browser game about rolling numbers, collecting badges and earning upgrades.                   | `browser-game`, `incremental-game`, `numbers`, `javascript` |
| [jAIgent](https://github.com/jaime-gaming/jAIgent)                 | A command-line AI agent for working with files, searches and your own API keys.                 | `ai-agent`, `cli`, `python`                                 |
| [minesweeper](https://github.com/jaime-gaming/minesweeper)         | A minimalist Minesweeper browser game with keyboard, touch and controller support.              | `browser-game`, `puzzle-game`, `javascript`                 |
| [snake](https://github.com/jaime-gaming/snake)                     | A minimalist Snake browser game with multiple modes and keyboard, touch and controller support. | `browser-game`, `arcade-game`, `javascript`                 |
| [VOID](https://github.com/jaime-gaming/VOID)                       | A psychological horror experience set inside the mysterious VOID Corporation.                   | `psychological-horror`, `horror-game`                       |
| [jaime-gaming](https://github.com/jaime-gaming/jaime-gaming)       | Jaime Gaming's GitHub profile and project overview.                                             | No additional topics proposed for the profile repository.   |

Keep existing relevant topics; the additions are suggestions, not a request to remove existing
ones. GitHub limits topic names and counts. Update the descriptions and add the suggested topics
in each repository's **About** settings, or use `gh repo edit` with `--description` and
`--add-topic` after authorization. No repository source, tags or releases need to be changed.

For Wave, the attempt to update About settings and enable private vulnerability reporting was
rejected with HTTP 403 because this GitHub integration lacks the necessary administration
permission. The repository's [security policy](../SECURITY.md) therefore provides the maintainer's
publicly listed email instead of promising an unavailable reporting form. An administrator can
enable private vulnerability reporting in repository settings and update the policy afterwards.

## Community-file review

This is a root-file and README review of the public default branches, not a legal audit. No
community files were changed in the other repositories.

- **Wave:** `LICENSE` is MIT; the third-party notices are separate. This branch updates the
  changelog, contribution guidance and security policy.
- **jAIgent:** the root already contains `LICENSE.md`, `CHANGELOG.md`, `CONTRIBUTING.md` and
  `SECURITY.md`. Its license is a custom, restricted license, not MIT; GitHub's missing license
  classification does not mean there is no license. Its maintainers should verify the supported
  Python versions and the private reporting instructions against the current release and settings.
- **RNGdle-Infinite, minesweeper, snake, VOID and the profile repository:** no root `LICENSE` or
  `COPYING` file was found in this review. That alone does not establish the rights to every asset
  or file. Only the copyright holder can decide whether and under what terms to license them;
  do not copy Wave's MIT license onto these repositories by assumption. Games may benefit from a
  concise contribution guide and release history when they begin accepting contributions or
  publishing versions. A security policy is most relevant where there are credentials, APIs or
  other sensitive integrations.
