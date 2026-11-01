# Jake Opener

A Claude Code mod that puts one-press links beside a session for opening the things that session is working on: its PRs in Graphite, its repo in an editor.

## Language

**Opener**:
One kind of one-press link: a name plus the rule that resolves what it opens, from the session or from one pull request in the Stack. It is shown exactly when that rule resolves a Target.
_Avoid_: Quick link, shortcut, action

**Band control**:
Something in the band that changes what the band shows (stepping through a fork, toggling the Stack pane) or marks a branch's state, rather than opening a Target. Not an Opener.
_Avoid_: Button, Opener

**Target**:
The concrete thing an Opener resolves to and opens, such as a URL or a directory.
_Avoid_: Destination, link

**Graphite link**:
The URL of a pull request's page on Graphite rather than on GitHub.
_Avoid_: Graphite PR link, gt link

**PR link decoration**:
Icons drawn around a pull request link in the transcript: a GitHub icon before it, a Graphite icon after it that opens the Graphite link. Not an Opener: it attaches to text Claude wrote, not to session state.
_Avoid_: Link rewrite, PR badge

**Session Rail**:
The desktop app's side panel showing the pull requests bound to a session.
_Avoid_: Sidebar, PR panel

**Stack**:
The chain of dependent branches, each with its own pull request, that the current branch sits in.
_Avoid_: Branch chain, PR chain
