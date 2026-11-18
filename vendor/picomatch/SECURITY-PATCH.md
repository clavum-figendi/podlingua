# Local picomatch security mitigation

Source: https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz

Original tarball SHA-256: `697b463be3cdbd9ffc8f4194fd5019a69ddf95875fb703d78b2b115cc9e740a8`.

Advisory: [GHSA-fc5q-39xc-vjpf / CVE-2026-112366](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).

At implementation time no patched npm picomatch release exists. npm's proposed Vite downgrade exposes other known Vite vulnerabilities. Keep Vite 8.3.8 and override every picomatch consumer with this local, MIT-licensed distribution instead. This package is build tooling, not browser runtime code.

Changes from upstream:

- `lib/parse.js`: before compiling a repeated `+(...)` / `*(...)` extglob, classify every body containing `*` as risky. Reuse upstream's literalization path instead of emitting nested unbounded quantifiers. The guard also applies when `maxExtglobRecursion` is disabled. Ordinary stars/globstars outside repeated extglobs and literal-only extglobs remain supported. Repeated bodies containing any star intentionally become literal patterns, even with escaped/quoted/class stars or previously safe nested-star rewrites. This conservative compatibility trade-off avoids a second lexer disagreeing with the parser on malformed brackets, quotes or options. No Podlingua source/config relies on those repeated-star extglobs; the real build and browser suite verify application compatibility.
- `package.json`: identify the local version as `4.0.7-podlingua.1`; remove upstream development dependencies and scripts, which are unnecessary for consuming the distribution. Preserve upstream source, attribution and MIT license.

`tests/glob-security.test.js` runs attack patterns in killable child processes, including malformed/quoted brackets and `nobracket` / `maxExtglobRecursion` variations found during independent review. The unmodified 4.0.7 source and the initial bracket-aware guard time out; the final mitigation passes, alongside normal filename and literal-extglob matching checks. Full application unit/build/browser checks also run with this package installed through npm's override.

**Audit limitation:** npm audit does not assess local file dependencies. A zero registry-audit count is not evidence for this local patch; the behavioral security regression tests provide that evidence. This is a targeted mitigation, not a claim that all possible regex/glob denial-of-service shapes are eliminated.

Maintenance: when an upstream patched release becomes available, review the advisory and matching behavior, remove the root picomatch devDependency and override plus this vendor directory, regenerate the lockfile/notices/Pages build, and rerun the security and application suites. Keep the attack tests, resolving the installed upstream package rather than the vendor path after migration.
