import { describe, expect, test } from "bun:test";
import { chinaDate, chinaNow, computeId, isValidId, isValidWxId, maskWxId, escapeLike } from "../src/utils";

describe("computeId", () => {
  test("与客户端算法一致：wxId + 0x00 + content + 0x00 + createTime(十进制字符串)", async () => {
    const wxId = "wxid_abc123";
    const content = "你好，世界";
    const createTime = "1750000000000";
    const expected = new Bun.CryptoHasher("sha256")
      .update(wxId + "\0" + content + "\0" + createTime)
      .digest("hex");
    expect(await computeId(wxId, content, createTime)).toBe(expected);
    expect(await computeId(wxId, content, createTime)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("createTime 原样拼接：13 位毫秒不得截断", async () => {
    const wxId = "wxid_x";
    const content = "a";
    const withMs = "1750000000123";
    const withoutMs = "1750000000";
    expect(await computeId(wxId, content, withMs)).not.toBe(await computeId(wxId, content, withoutMs));
  });
});

describe("校验与脱敏", () => {
  test("isValidId", () => {
    expect(isValidId("a".repeat(64))).toBe(true);
    expect(isValidId("A".repeat(64))).toBe(false);
    expect(isValidId("a".repeat(63))).toBe(false);
    expect(isValidId("g".repeat(64))).toBe(false);
  });

  test("isValidWxId：1-64 可打印 ASCII", () => {
    expect(isValidWxId("wxid_abc")).toBe(true);
    expect(isValidWxId("")).toBe(false);
    expect(isValidWxId("x".repeat(65))).toBe(false);
    expect(isValidWxId("含中文")).toBe(false);
    expect(isValidWxId("has space")).toBe(true);
  });

  test("maskWxId", () => {
    expect(maskWxId("wxid_abcd1234")).toBe("wxid_a…34");
    expect(maskWxId("short")).toBe("sh…rt");
  });

  test("escapeLike", () => {
    expect(escapeLike("a%b_c")).toBe("a\\%b\\_c");
  });
});

describe("时间", () => {
  test("chinaNow 为 UTC+8 的 YYYY-MM-DD HH:MM:SS", () => {
    const t = chinaNow();
    expect(t).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(chinaDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
