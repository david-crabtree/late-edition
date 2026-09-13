# Reporting a security problem

Late Edition runs on your machine, reads the sources you point it at, and drives agent
command lines you have installed yourself. The things worth reporting are the ones where
content it did not write ends up doing something on your computer: a feed or page that
reaches a shell, a file outside the newsroom folder being read or written, a link in an
edition that runs rather than opens, or a network request the privacy statement does not
mention.

**Please report privately, not in a public issue.** Use
[GitHub's private vulnerability reporting](https://github.com/david-crabtree/late-edition/security/advisories/new)
for this repository. Say what you did, what happened, and which version and platform.

You will get a reply within a week. A fix ships as a normal release, with a line in the
release notes crediting you unless you would rather it did not.

Only the latest release is supported. Nothing is code-signed, so check the download
against `SHA256SUMS.txt` on the release page before you run it.
