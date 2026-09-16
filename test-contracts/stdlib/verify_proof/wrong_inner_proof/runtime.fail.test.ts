// This file is part of Compact.
// Copyright (C) 2026 Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//  	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
    createTestContract,
    defineRuntimeTest,
    readInnerProof,
} from '@test/compact-test';

import type { Contract as GeneratedContract } from './.build/contract/index.js';

/**
 * A proof whose bytes have been tampered with is rejected when the circuit
 * runs, before anything is recorded for proving.
 *
 * Only the last byte changes, so the proof still decodes and the failure is the
 * opening check in `checkInnerProof` rather than a transcript parse error.
 */
export default defineRuntimeTest<typeof GeneratedContract>(
    import.meta.url,
    async (Contract) => {
        const inner = readInnerProof('basic');

        const corrupted = Uint8Array.from(inner.proof);
        corrupted[corrupted.length - 1] ^= 0xff;

        const { contract, ctx } = await createTestContract(Contract, {
            innerProof: (context) => [context.privateState, corrupted],
        });

        await contract.circuits.verifyProofWrongInnerProof(
            ctx,
            inner.instance[0],
        );
    },
    {
        expectedError: /Multi-opening proof was invalid/,
    },
);
