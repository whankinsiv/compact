// This file is part of Compact.
// Copyright (C) 2025 Midnight Foundation
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

import { Result } from 'execa';
import { describe, test } from 'vitest';
import { Arguments, compile, compilerDefaultOutput, createTempFolder, expectCompilerResult, expectFiles } from '@';

describe('[Constructor] Compiler', () => {
    const CONTRACTS_ROOT = '../examples/errors/constructor/';

    // A constructor may only compute the contract's initial state. Operations that
    // produce a transaction-level effect (minting/sending/receiving/burning tokens
    // or coins, Zswap coin ops) have nowhere to go at deploy time and are rejected
    // at compile time, whether reached directly or (in)directly through a helper.
    test.each([
        // Level 1 -- a built-in operation invoked directly in the constructor body.
        {
            file: 'effect_direct_kernel.compact',
            error: /Exception: effect_direct_kernel.compact line 20 char 9: constructor cannot perform the unpermitted built-in operation "kernel.checkpoint"/,
        },
        {
            file: 'effect_native_zswap_output.compact',
            error: /Exception: effect_native_zswap_output.compact line 20 char 3: constructor cannot perform the unpermitted built-in operation "createZswapOutput"/,
        },
        {
            // claimContractCall is an effect op that the cross-contract-call check does not catch
            file: 'effect_claim_contract_call.compact',
            error: /Exception: effect_claim_contract_call.compact line 20 char 9: constructor cannot perform the unpermitted built-in operation "kernel.claimContractCall"/,
        },
        // Level 2 -- reached through a user-defined circuit.
        {
            file: 'effect_user_wrapper.compact',
            error: /Exception: effect_user_wrapper.compact line 22 char 1: usage of the circuit "myWrapper" performs the unpermitted built-in operation "kernel.mintUnshielded" at line 20 char 9/,
        },
        // Level 3 -- reached through a standard library operation.
        {
            file: 'effect_mint_shielded.compact',
            error: /Exception: effect_mint_shielded.compact line 19 char 1: usage of the standard library operation "mintShieldedToken" performs the unpermitted built-in operation "kernel.claimZswapCoinSpend" at <standard library>/,
        },
        {
            file: 'effect_receive_unshielded.compact',
            error: /Exception: effect_receive_unshielded.compact line 19 char 1: usage of the standard library operation "receiveUnshielded" performs the unpermitted built-in operation "kernel.incUnshieldedInputs" at <standard library>/,
        },
        // kernel.self() returns the zero address during construction: distinct diagnostic,
        // same three-level shape (direct / circuit / stdlib).
        {
            file: 'self_reference.compact',
            error: /Exception: self_reference.compact line 22 char 26: constructor cannot use the built-in operation "kernel.self"/,
        },
        {
            file: 'self_via_circuit.compact',
            error: /Exception: self_via_circuit.compact line 24 char 1: usage of the circuit "readAddr" reads the built-in operation "kernel.self" at line 22 char 16/,
        },
    ])(`should reject: $error for contract: $file`, async ({ file, error }) => {
        const outputDir = createTempFolder();
        const result: Result = await compile([Arguments.VSCODE, CONTRACTS_ROOT + file, outputDir]);

        expectCompilerResult(result).toBeFailure(error, compilerDefaultOutput());
        expectFiles(outputDir).thatNoFilesAreGenerated();
    });

    // Pure/state-only constructors, and the same effect operations used outside a
    // constructor (in a normal circuit), must still compile.
    test.each([
        { file: 'ok_state_only.compact' },
        { file: 'ok_effect_in_circuit.compact' },
    ])(`should compile: $file`, async ({ file }) => {
        const outputDir = createTempFolder();
        const result: Result = await compile([Arguments.SKIP_ZK, CONTRACTS_ROOT + file, outputDir]);

        expectCompilerResult(result).toBeSuccess('', compilerDefaultOutput());
        expectFiles(outputDir).thatGeneratedJSCodeIsValid();
    });
});
