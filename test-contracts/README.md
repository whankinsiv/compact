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

Fixtures that need a non-default compiler mode declare `compilerFlags`, which
are passed to `compactc` ahead of the contract and output paths:

```ts
export default defineCompileTest(import.meta.url, {
    compilerFlags: ['--feature-zkir-v3', '--skip-zk'],
});
```

The `stdlib/verify_proof/` fixtures use this because `verifyProof` only lowers
through the ZKIR v3 backend, and because the pinned zkir binary does not yet
implement the `inner_proof`/`verify_proof` gates that proving-key generation
would need.

## Inner Proofs

The statements the `verifyProof` fixtures verify are midnight-zk relations, one
module each in `tools/verify-proof-fixtures/src/proofs/`. The runner rebuilds
every proof before the compile phase begins, writing a bundle to that tool's
`out/` directory holding the verifying key, its sha256, the statement's public
inputs and the proof. A runtime test reads one with
`readInnerProof('<circuit>')`.

```json
{
    "circuit": "basic",
    "vkHash": "ede1c712...",
    "vk": "<base64>",
    "instance": ["123"],
    "proof": "<base64>"
}
```

A runtime test pins the bundle's `vkHash` against the constant its contract
compiles in, so a relation edited without the contract following fails there
rather than verifying a different statement unnoticed.

The bundles are generated output rather than checked in, so the generator has
to exist before a fixture that needs one can run. `./test-contracts/test.sh`
builds it; on its own, build it with:

```sh
cargo build --release --manifest-path tools/verify-proof-fixtures/Cargo.toml
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
`vitest.config.ts`. `yarn lint` prepares generated imports with `--skip-zk`,
alongside any `compilerFlags` the fixture declares; `yarn test` uses full
compiler runs so compile tests still cover proving-key generation.
