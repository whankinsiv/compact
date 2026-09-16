// This file is part of Compact.
// Copyright (C) 2025 Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// you may obtain a copy of the License at
//
//  	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { expect } from 'vitest';

import {
    createTestContract,
    defineRuntimeTest,
    readInnerProof,
} from '@test/compact-test';

import type { Contract as GeneratedContract } from './.build/contract/index.js';

/**
 * A valid proof of `attested_value == 123` must not verify a call that attests
 * a different value.
 */
export default defineRuntimeTest<typeof GeneratedContract>(
    import.meta.url,
    async (Contract) => {
        const inner = readInnerProof('basic');

        expect(inner.instance).toEqual([123n]);

        const { contract, ctx } = await createTestContract(Contract, {
            inner_proof: (context) => [context.privateState, inner.proof],
        });

        await contract.circuits.verify_proof_wrong_attested_value(
            ctx,
            inner.instance[0] + 1n,
        );
    },
    {
        // Nothing narrower is known: today only the ledger's pairing check
        // rejects this, so the runtime has no message to match. `TypeError` is
        // excluded because a plumbing bug would also throw, and would otherwise
        // read as a pass.
        expectedError: (error) =>
            error instanceof Error && !(error instanceof TypeError),
    },
);
