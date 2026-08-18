import { describe, expect, test } from "bun:test";
import { safeJson } from "./utils";
import { ipInCidr, isValidIp, overLimitWxId, resolveXffIp } from "./rate-limit";
import { REGISTER_PER_WXID_PER_MIN } from "./config";

describe("safeJson（内联 <script> 安全序列化）", () => {
  test("阻断 </script> 逃逸", () => {
    const out = safeJson({ content: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script\\u003e");
  });

  test("< > & 转义为 JS 等价 Unicode 序列", () => {
    expect(safeJson("<&>")).toBe('"\\u003c\\u0026\\u003e"');
  });

  test("U+2028 / U+2029 行分隔符转义", () => {
    expect(safeJson("a\u2028b")).toBe('"a\\u2028b"');
    expect(safeJson("a\u2029b")).toBe('"a\\u2029b"');
  });

  test("普通字符串语义不变（转义序列在 JS 内等价原字符）", () => {
    // JSON.stringify 输出转义后的字符串字面量，经 JSON.parse 还原应等于原值
    expect(JSON.parse(safeJson({ wxId: "wxid_abc", level: 3 }))).toEqual({ wxId: "wxid_abc", level: 3 });
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
