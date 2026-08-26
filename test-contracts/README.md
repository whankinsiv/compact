# Compact Test Contracts

This package contains self-contained Compact semantic fixtures. Each fixture
directory owns its Compact source and the tests that declare whether that source
should pass or fail at compile time or runtime.

## Fixture Layout

```text
test-contracts/
  primitives/
    bytes/
      slice/
        basic/
          bytes_slice_basic.compact
          compile.pass.test.ts
          runtime.pass.test.ts
```

Test expectations are intentionally visible from file names:

- Compile pass: `compile.pass.test.ts` expects the colocated `.compact` file to compile.
- Compile fail: `compile.fail.test.ts` expects the colocated `.compact` file to fail compilation.
- Runtime pass: `runtime.pass.test.ts` expects the generated contract to execute successfully.
- Runtime fail: `runtime.fail.test.ts` expects runtime execution to throw.

Each fixture directory must contain exactly one `.compact` file. Runtime tests
require a matching `compile.pass.test.ts` file in the same fixture directory.

## Execution Model

Vitest only loads `compact-test-orchestrator.test.ts`. That orchestrator
discovers fixture files, registers compile tests, and lets each runtime test
await its own cached compile prerequisite before importing generated artifacts.

This keeps compilation visible as part of the test suite while allowing runtime
tests to type against generated `Contract` imports for hover and
go-to-definition. Fixtures under a `slow/` path segment still run by default,
but their compile work runs exclusively so expensive proving-key generation does
not race other compiler jobs.

## Compile Tests

Compile tests export metadata through `defineCompileTest`:

```ts
import { defineCompileTest } from '@test/compact-test';

export default defineCompileTest(import.meta.url);
```

For compile-fail fixtures, include the diagnostic that proves the expected
failure happened:

```ts
export default defineCompileTest(import.meta.url, {
    expectedError: /expected tuple\/vector spread expression/,
});
```

## Runtime Tests

Runtime tests statically import the generated contract path for their fixture
and export metadata through `defineRuntimeTest`:

```ts
import { expect } from 'vitest';

import type { Contract } from './.build/contract/index.js';
import {
    createTestContract,
    defineRuntimeTest,
} from '@test/compact-test';

export default defineRuntimeTest<typeof Contract>(import.meta.url, async (Contract) => {
    const { contract, ctx } = await createTestContract(Contract);
    const result = (await contract.circuits.bytes_slice_basic(ctx)).result;

    expect(Array.from(result)).toEqual([5]);
});
```

The generated type import is valid during local typechecking because
`yarn lint` prepares runtime fixture artifacts before running
`tsc --noEmit`. Runtime execution imports the generated `Contract` value from
the fixture `.build/` directory after the matching compile test has completed,
then passes it to the fixture callback.

## Generated Artifacts

The runner writes generated output under each fixture's local `.build/`
directory. It removes stale output before compiling each selected fixture, then
reuses that output for the matching runtime test.

After the suite finishes, artifacts for selected fixtures whose tests passed are
deleted. Artifacts for fixtures with unexpected failures are preserved for
debugging, including failed runtime imports, failed runtime assertions, and
unexpected compile results. Expected failures that pass, such as
`compile.fail.test.ts`, are cleaned up like any other passing fixture.

Set `COMPACT_TEST_KEEP_ARTIFACTS=1` to preserve passing fixture artifacts during
local debugging:

```sh
COMPACT_TEST_KEEP_ARTIFACTS=1 yarn test primitives/bytes/slice/basic/runtime.pass.test.ts
```

## Commands

Run from this package directory:

```sh
corepack yarn install --immutable
yarn lint
yarn test
yarn test primitives/bytes/slice/basic/runtime.pass.test.ts
```

`yarn test` runs all fixtures. Non-option arguments are treated as
fixture or test-file path filters. Selecting a runtime test also selects its
compile prerequisite, so a runtime-only filtered run still compiles the fixture
inside Vitest before importing the generated contract value.

The package links `@midnight-ntwrk/compact-runtime` through the
`.compact-runtime` symlink, which points at a locally built runtime — the
prebuilt Nix package substituted from the cache (CI) or the working-tree build
at `../runtime` (local development). The easiest command from the repository
root is:

```sh
./test-contracts/test.sh
```

That wrapper links the runtime the `.#test-contracts` Nix shell pulled from the
cache (`$COMPACT_RUNTIME_PKG`, falling back to `../runtime`), installs this
package with Corepack/Yarn, and runs the fixtures with the Nix-built `compactc`
compiler. Compile hang
protection is owned by Vitest and CI through `testTimeout` in
`vitest.config.ts`. `yarn lint` prepares generated imports with `--skip-zk`;
`yarn test` uses full compiler runs so compile tests still cover proving-key
generation.

## Language Coverage

`./test-contracts/go` measures how much of the compiler these fixtures exercise.
It is the fixture-suite counterpart of `./compiler/go` and works the same way:
build the compiler with Chez profiling on, push something through it, then read
the profile back. The only differences are the driver — fixture files on disk
rather than the tests inlined in `compiler/test.ss` — and the directory the
report lands in.

```sh
nix develop .#compiler --command ./test-contracts/go
```

Or as part of a suite run, which does both in one command:

```sh
./test-contracts/test.sh --coverage
```

It stays opt-in rather than folded into `test.sh` unconditionally, because it
needs `obj/profiled-compiler` — a from-source Chez build of the compiler with
profiling enabled — which the suite proper does not: that uses the packaged
`compactc` straight from the Nix cache. The two also answer different questions.
`test.sh` is the gate: do the fixtures behave as their file names say. Coverage
is a report.

Output is `test-contracts/coverage/`, in the same shape as the `coverage/`
that `compiler/go` writes: the per-file line-coloured dump `profile-dump-html` produces, plus
a summary line in the same form `compiler/go` prints.

```text
====================== START OF FIXTURE TESTS =====================
found 101 fixtures under test-contracts/primitives
101 of 101 fixtures produced their expected compile result
======== END OF FIXTURE TESTS. COVERAGE = 45% (33491/74503). ========
```

Read the number the way you read the compiler's own: it counts profiled source
blocks under `compiler/`, a block covered when it ran at least once. Expect it
far below `compiler/go`'s, and not because the fixtures are weak — the
denominator is the whole compiler, including the formatter, the fixup tool, zkir
emission, source maps and every error path, most of which no well-formed
contract reaches. What it is good for is the same thing `coverage/` is good for:
opening the dump and seeing which lines of the front end are cold.

The fixtures are also checked as they are compiled — a fixture must fail only if
a `compile.fail.test.ts` sits beside it — so a non-zero exit means a fixture
behaved unexpectedly, exactly as `compiler/go` exits non-zero on a failed unit
test.

CI runs it inside the compiler workflow rather than this one. `build-compiler.yml`
already builds a profiled compiler for `./compiler/go`, so running
`./test-contracts/go` straight afterwards reuses those objects and costs only
the fixture compiles; the report is uploaded as a build artifact alongside the
compiler's own. Nothing gates on the number — a percentage would ratchet down
every time the language grows a production, for reasons unrelated to the
fixtures. The report is there to be read.
