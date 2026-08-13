import { describe, expect, test } from "bun:test";
import {
  DEFAULT_FORMULA,
  computeValues,
  geoQuotaFor,
  quotaFor,
  retentionMonthsFor,
  validateFormula,
} from "./levels";
import { chinaMonthsAgo } from "./utils";

describe("公式求值", () => {
  test("默认公式 x：权益值 = 等级", () => {
    expect(DEFAULT_FORMULA).toBe("x");
    expect(quotaFor(1)).toBe(1);
    expect(quotaFor(5)).toBe(5);
    expect(geoQuotaFor(2)).toBe(2);
    expect(retentionMonthsFor(3)).toBe(3);
    expect(quotaFor(0)).toBe(0);
  });

  test("x*2-1：等级乘 2 减 1", () => {
    expect(computeValues("x*2-1")[1]).toBe(1);
    expect(computeValues("x*2-1")[2]).toBe(3);
    expect(computeValues("x*2-1")[10]).toBe(19);
  });

  test("min/max/括号", () => {
    const v = computeValues("min(x*100, 1000)");
    expect(v[1]).toBe(100);
    expect(v[10]).toBe(1000);
    expect(v[99]).toBe(1000);
    expect(computeValues("max(20, x*50)")[1]).toBe(50);
    expect(computeValues("max(20, x)")[0]).toBe(20);
  });

  test("函数与幂", () => {
    expect(computeValues("floor(x*x/2)")[3]).toBe(4);
    expect(computeValues("pow(2,x-1)*20")[1]).toBe(20);
    expect(computeValues("2^x")[3]).toBe(8);
    expect(computeValues("round(x/2)")[1]).toBe(1);
    expect(computeValues("round(x/2)")[2]).toBe(1);
    expect(computeValues("ceil(x/2)")[2]).toBe(1);
  });

  test("取整与截断", () => {
    // 负值截断为 0
    expect(computeValues("x-5")[1]).toBe(0);
    expect(computeValues("x-5")[6]).toBe(1);
  });
});

describe("公式校验", () => {
  test("合法公式返回 null", () => {
    expect(validateFormula("x*2-1")).toBeNull();
    expect(validateFormula("min(x, 99)")).toBeNull();
  });

  test("非法公式返回错误信息", () => {
    expect(validateFormula("x+")).not.toBeNull();
    expect(validateFormula("foo(x)")).not.toBeNull();
    expect(validateFormula("eval(x)")).not.toBeNull();
    expect(validateFormula("x; rm -rf /")).not.toBeNull();
  });
});

describe("极限情况", () => {
  test("level 0 全部权益为 0（默认公式 x）", () => {
    expect(quotaFor(0)).toBe(0);
    expect(geoQuotaFor(0)).toBe(0);
    expect(retentionMonthsFor(0)).toBe(0);
  });

  test("超大值被截断到安全整数上限", () => {
    expect(computeValues("x^x")[99]).toBe(Number.MAX_SAFE_INTEGER);
    expect(computeValues("10^30")[1]).toBe(Number.MAX_SAFE_INTEGER);
    expect(computeValues("9999999999999999999999999999999")[1]).toBe(Number.MAX_SAFE_INTEGER);
    expect(computeValues("x*x*x*x*x*x*x*x*x*x*x*x*x*x*x*x*x*x*x*x")[20]).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("溢出/除零/NaN 归 0", () => {
    expect(computeValues("x/0")[1]).toBe(0);
    expect(computeValues("0/0")[1]).toBe(0);
    expect(computeValues("x%0")[1]).toBe(0);
    expect(computeValues("pow(10,400)")[1]).toBe(0);
  });

  test("负值归 0", () => {
    expect(computeValues("-x")[5]).toBe(0);
    expect(computeValues("x-10")[3]).toBe(0);
  });

  test("小数四舍五入取整", () => {
    expect(computeValues("x/2")[1]).toBe(1);
    expect(computeValues("x/2")[2]).toBe(1);
    expect(computeValues("x*0.1")[3]).toBe(0);
  });

  test("chinaMonthsAgo 超大月数不抛异常且退化为不裁剪", () => {
    expect(() => chinaMonthsAgo(Number.MAX_SAFE_INTEGER)).not.toThrow();
    expect(chinaMonthsAgo(Number.MAX_SAFE_INTEGER)).toBe("0000-00-00 00:00:00");
    expect(chinaMonthsAgo(1).slice(0, 4)).not.toBe("0000");
  });
});
