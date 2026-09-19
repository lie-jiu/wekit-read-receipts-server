import { describe, expect, test } from "bun:test";
import { computeId, sha256Hex } from "./utils";
import { ipInCidr, isValidIp, overLimitWxId, resolveXffIp } from "./rate-limit";
import { REGISTER_PER_WXID_PER_MIN } from "./config";

describe("sha256Hex / computeId（纯 TS SHA-256，跨运行时一致）", () => {
  test("FIPS 标准测试向量", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(
      sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  test("与 Bun.CryptoHasher 随机输入逐位一致（含多块与多字节 UTF-8）", () => {
    const alphabet = "ab中文🔥xyz01";
    for (let n = 0; n < 200; n++) {
      const len = Math.floor(Math.random() * 200); // 覆盖 <55 / >64 多块、边界长度
      let s = "";
      for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
      expect(sha256Hex(s)).toBe(new Bun.CryptoHasher("sha256").update(s).digest("hex"));
    }
  });

  test("computeId 与流式 CryptoHasher 拼接语义一致", () => {
    const id = computeId("wxid_demo", "消息内容 hello", "1757000000123");
    const expectId = new Bun.CryptoHasher("sha256")
      .update("wxid_demo")
      .update(new Uint8Array([0]))
      .update("消息内容 hello")
      .update(new Uint8Array([0]))
      .update("1757000000123")
      .digest("hex");
    expect(id).toBe(expectId);
  });
});

describe("isValidIp（XFF 格式校验）", () => {
  test("合法 IPv4", () => {
    expect(isValidIp("1.2.3.4")).toBe(true);
    expect(isValidIp("255.255.255.255")).toBe(true);
    expect(isValidIp("0.0.0.0")).toBe(true);
  });

  test("非法 IPv4", () => {
    expect(isValidIp("256.1.1.1")).toBe(false);
    expect(isValidIp("1.2.3")).toBe(false);
    expect(isValidIp("1.2.3.4.5")).toBe(false);
    expect(isValidIp("1.2.3.a")).toBe(false);
  });

  test("合法 IPv6", () => {
    expect(isValidIp("::1")).toBe(true);
    expect(isValidIp("2001:db8::1")).toBe(true);
  });

  test("非法字符串被拒绝", () => {
    expect(isValidIp("")).toBe(false);
    expect(isValidIp("abc")).toBe(false);
    expect(isValidIp("1.2.3.4, foo")).toBe(false);
    expect(isValidIp("</script>")).toBe(false);
  });
});

describe("resolveXffIp（X-Forwarded-For 右取值）", () => {
  const trusted = ["10.0.0.0/8"];

  test("追加模式：伪造值在首部被跳过，取真实客户端 IP", () => {
    // nginx $proxy_add_x_forwarded_for：客户端伪造 "9.9.9.9" 后，反代追加真实 IP 1.2.3.4 与自身 10.0.0.1
    const xff = "9.9.9.9, 1.2.3.4, 10.0.0.1";
    expect(resolveXffIp(xff, trusted)).toBe("1.2.3.4");
  });

  test("全为受信代理时取最右值", () => {
    expect(resolveXffIp("10.0.0.1, 10.0.0.2", trusted)).toBe("10.0.0.2");
  });

  test("非法段被过滤", () => {
    expect(resolveXffIp("evil, 10.0.0.1", trusted)).toBe("10.0.0.1");
  });

  test("无代理网段命中时返回客户端 IP", () => {
    expect(resolveXffIp("1.2.3.4", trusted)).toBe("1.2.3.4");
  });

  test("IPv4-mapped IPv6 归一化", () => {
    expect(resolveXffIp("::ffff:1.2.3.4, 10.0.0.1", trusted)).toBe("1.2.3.4");
  });
});

describe("ipInCidr", () => {
  test("IPv4 CIDR 命中", () => {
    expect(ipInCidr("192.168.1.5", "192.168.1.0/24")).toBe(true);
    expect(ipInCidr("10.0.0.1", "192.168.1.0/24")).toBe(false);
  });

  test("非法 CIDR 返回 false", () => {
    expect(ipInCidr("1.2.3.4", "not-a-cidr")).toBe(false);
  });
});

describe("overLimitWxId（公开 /register 按 wxId 限流）", () => {
  test("分钟窗口内超过上限后拒绝", () => {
    const wxId = `test_wxid_${crypto.randomUUID()}`;
    for (let i = 0; i < REGISTER_PER_WXID_PER_MIN; i++) {
      expect(overLimitWxId(wxId)).toBe(false);
    }
    expect(overLimitWxId(wxId)).toBe(true);
  });
});
