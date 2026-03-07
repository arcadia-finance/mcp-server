import { describe, it, expect } from "vitest";
import { decodeFunctionData, keccak256, concat, toBytes, pad } from "viem";
import { factoryAbi } from "../../../abis/index.js";
import { PROTOCOL } from "../../../config/addresses.js";
import {
  createMockServer,
  createMockChains,
  parseToolResponse,
  TEST_ADDRESS,
  TEST_POOL,
} from "../../../test-utils.js";
import { registerCreateTool, computeAccountAddress } from "./create.js";

function setup() {
  const mock = createMockServer();
  registerCreateTool(mock.server, createMockChains());
  return mock.getHandler("write.account.create");
}

describe("write.account.create", () => {
  it("encodes createAccount(salt, version, creditor) correctly", async () => {
    const handler = setup();
    const result = await handler({
      salt: 42,
      wallet_address: TEST_ADDRESS,
      account_version: 1,
      creditor: TEST_POOL,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: factoryAbi, data: transaction.data });

    expect(decoded.functionName).toBe("createAccount");
    expect(decoded.args[0]).toBe(42);
    expect(decoded.args[1]).toBe(1n);
    expect(decoded.args[2].toLowerCase()).toBe(TEST_POOL.toLowerCase());
  });

  it("uses zero address when creditor is omitted", async () => {
    const handler = setup();
    const result = await handler({
      salt: 1,
      wallet_address: TEST_ADDRESS,
      account_version: 1,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: factoryAbi, data: transaction.data });

    expect(decoded.args[2]).toBe("0x0000000000000000000000000000000000000000");
  });

  it("returns correct to address (factory)", async () => {
    const handler = setup();
    const result = await handler({
      salt: 1,
      wallet_address: TEST_ADDRESS,
      account_version: 1,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    expect(transaction.to).toBe(PROTOCOL.factory);
  });

  it("returns value '0' and correct chainId", async () => {
    const handler = setup();
    const result = await handler({
      salt: 1,
      wallet_address: TEST_ADDRESS,
      account_version: 1,
      chain_id: 130,
    });

    const { transaction } = parseToolResponse(result);
    expect(transaction.value).toBe("0");
    expect(transaction.chainId).toBe(130);
  });
});

describe("computeAccountAddress", () => {
  const factory = PROTOCOL.factory as `0x${string}`;
  const impl = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01" as `0x${string}`;

  it("returns a valid checksum address", () => {
    const addr = computeAccountAddress(factory, 1, TEST_ADDRESS, impl);
    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("is deterministic (same inputs → same output)", () => {
    const a = computeAccountAddress(factory, 42, TEST_ADDRESS, impl);
    const b = computeAccountAddress(factory, 42, TEST_ADDRESS, impl);
    expect(a).toBe(b);
  });

  it("changes when salt changes", () => {
    const a = computeAccountAddress(factory, 1, TEST_ADDRESS, impl);
    const b = computeAccountAddress(factory, 2, TEST_ADDRESS, impl);
    expect(a).not.toBe(b);
  });

  it("changes when wallet changes", () => {
    const wallet2 = "0x9999999999999999999999999999999999999999" as `0x${string}`;
    const a = computeAccountAddress(factory, 1, TEST_ADDRESS, impl);
    const b = computeAccountAddress(factory, 1, wallet2, impl);
    expect(a).not.toBe(b);
  });

  it("changes when implementation changes", () => {
    const impl2 = "0x1111111111111111111111111111111111111111" as `0x${string}`;
    const a = computeAccountAddress(factory, 1, TEST_ADDRESS, impl);
    const b = computeAccountAddress(factory, 1, TEST_ADDRESS, impl2);
    expect(a).not.toBe(b);
  });

  it("uses only lowest 32 bits of wallet address for salt", () => {
    // Two wallets with same lowest 32 bits should produce the same address
    const w1 = "0x0000000000000000000000000000000012345678" as `0x${string}`;
    const w2 = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA12345678" as `0x${string}`;
    const a = computeAccountAddress(factory, 1, w1, impl);
    const b = computeAccountAddress(factory, 1, w2, impl);
    expect(a).toBe(b);
  });

  it("bytecode uses 20-byte address (abi.encodePacked), not 32-byte padded", () => {
    // Verify the bytecode hash matches what Solidity's abi.encodePacked would produce:
    // PROXY_BYTECODE ++ implementation (20 bytes, NOT 32 bytes)
    const PROXY_BYTECODE =
      "0x608060405260405161017c38038061017c8339810160408190526100229161008d565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc80546001600160a01b0319166001600160a01b0383169081179091556040517fbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b905f90a2506100ba565b5f6020828403121561009d575f80fd5b81516001600160a01b03811681146100b3575f80fd5b9392505050565b60b6806100c65f395ff3fe608060405236603c57603a7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc5b546001600160a01b03166063565b005b603a7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc602c565b365f80375f80365f845af43d5f803e808015607c573d5ff35b3d5ffdfea2646970667358221220eeb8a2fa918a2057b66e1d3fa3930647dc7a4e56c99898cd9e280beec9d9ba9f64736f6c63430008160033000000000000000000000000" as `0x${string}`;

    // Correct: 20-byte hex address appended (matching abi.encodePacked)
    const correctBytecode = concat([PROXY_BYTECODE, impl]);
    const correctHash = keccak256(correctBytecode);

    // Wrong: 32-byte padded address (extra 12 zero bytes)
    const wrongBytecode = concat([PROXY_BYTECODE, pad(impl, { size: 32 })]);
    const wrongHash = keccak256(wrongBytecode);

    // They must differ — the old bug would have used wrongHash
    expect(correctHash).not.toBe(wrongHash);

    // The function should use the correct (20-byte) version
    // Verify by recomputing the full CREATE2 address manually
    const userSalt = 1;
    const walletLower32 = Number(BigInt(TEST_ADDRESS) & 0xffffffffn);
    const saltBytes = concat([
      pad(toBytes(userSalt), { size: 4 }),
      pad(toBytes(walletLower32), { size: 4 }),
    ]);
    const salt = keccak256(saltBytes);
    const raw = keccak256(
      concat([toBytes("0xff"), toBytes(factory), toBytes(salt), toBytes(correctHash)]),
    );
    const expected = `0x${raw.slice(26)}`;

    const result = computeAccountAddress(factory, userSalt, TEST_ADDRESS, impl);
    expect(result.toLowerCase()).toBe(expected.toLowerCase());
  });
});
