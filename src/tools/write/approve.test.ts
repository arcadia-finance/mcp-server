import { describe, it, expect } from "vitest";
import { decodeFunctionData } from "viem";
import {
  createMockServer,
  createMockChains,
  parseToolResponse,
  TEST_ADDRESS,
  TEST_ACCOUNT,
} from "../../test-utils.js";
import { registerApproveTool } from "./approve.js";

const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

const ERC721_SET_APPROVAL_FOR_ALL_ABI = [
  {
    type: "function",
    name: "setApprovalForAll",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const MAX_UINT256 = 2n ** 256n - 1n;

function setup() {
  const mock = createMockServer();
  registerApproveTool(mock.server, createMockChains());
  return mock.getHandler("build_approve_tx");
}

describe("build_approve_tx", () => {
  it("encodes approve with explicit amount", async () => {
    const handler = setup();
    const result = await handler({
      token_address: TEST_ADDRESS,
      spender_address: TEST_ACCOUNT,
      amount: "1000000000",
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    expect(transaction.to.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());

    const decoded = decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: transaction.data });
    expect(decoded.functionName).toBe("approve");
    expect((decoded.args[0] as string).toLowerCase()).toBe(TEST_ACCOUNT.toLowerCase());
    expect(decoded.args[1]).toBe(1000000000n);
  });

  it("encodes max_uint256 approval", async () => {
    const handler = setup();
    const result = await handler({
      token_address: TEST_ADDRESS,
      spender_address: TEST_ACCOUNT,
      amount: "max_uint256",
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: transaction.data });
    expect(decoded.args[1]).toBe(MAX_UINT256);
  });

  it("defaults to max_uint256 when amount is omitted", async () => {
    const handler = setup();
    const result = await handler({
      token_address: TEST_ADDRESS,
      spender_address: TEST_ACCOUNT,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: transaction.data });
    expect(decoded.args[1]).toBe(MAX_UINT256);
  });

  it("returns tx 'to' as the token address", async () => {
    const handler = setup();
    const result = await handler({
      token_address: TEST_ADDRESS,
      spender_address: TEST_ACCOUNT,
      amount: "max_uint256",
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    expect(transaction.to.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
    expect(transaction.value).toBe("0");
  });

  it("encodes setApprovalForAll for erc721", async () => {
    const handler = setup();
    const result = await handler({
      token_address: TEST_ADDRESS,
      spender_address: TEST_ACCOUNT,
      asset_type: "erc721",
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({
      abi: ERC721_SET_APPROVAL_FOR_ALL_ABI,
      data: transaction.data,
    });
    expect(decoded.functionName).toBe("setApprovalForAll");
    expect((decoded.args[0] as string).toLowerCase()).toBe(TEST_ACCOUNT.toLowerCase());
    expect(decoded.args[1]).toBe(true);
  });

  it("encodes setApprovalForAll for erc1155", async () => {
    const handler = setup();
    const result = await handler({
      token_address: TEST_ADDRESS,
      spender_address: TEST_ACCOUNT,
      asset_type: "erc1155",
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({
      abi: ERC721_SET_APPROVAL_FOR_ALL_ABI,
      data: transaction.data,
    });
    expect(decoded.functionName).toBe("setApprovalForAll");
    expect(decoded.args[1]).toBe(true);
  });

  it("erc721 approval ignores amount param", async () => {
    const handler = setup();
    const result = await handler({
      token_address: TEST_ADDRESS,
      spender_address: TEST_ACCOUNT,
      asset_type: "erc721",
      amount: "999",
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({
      abi: ERC721_SET_APPROVAL_FOR_ALL_ABI,
      data: transaction.data,
    });
    expect(decoded.functionName).toBe("setApprovalForAll");
  });

  it("defaults to erc20 when asset_type is omitted", async () => {
    const handler = setup();
    const result = await handler({
      token_address: TEST_ADDRESS,
      spender_address: TEST_ACCOUNT,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: transaction.data });
    expect(decoded.functionName).toBe("approve");
  });
});
