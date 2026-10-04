/**
 * 等级权益公式求值器。
 *
 * 原项目的公式（MESSAGE_QUOTA_FORMULA 等）是 JS 表达式字符串，运行时由服务端求值。
 * 前端预览**不能**用任何「把字符串当代码编译」的动态求值 —— 那等于把管理员输入直接
 * 当代码执行，是一条实打实的表达式注入面。这里用受限递归下降解析：只有数字、`x`、
 * 四则与幂、括号，以及白名单函数参与求值，其余一律判为非法。
 */

export type FormulaResult = { ok: true; values: number[] } | { ok: false; error: string }

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  floor: (a) => Math.floor(a),
  ceil: (a) => Math.ceil(a),
  round: (a) => Math.round(a),
  abs: (a) => Math.abs(a),
  sqrt: (a) => Math.sqrt(a),
  pow: (a, b) => Math.pow(a, b ?? 2),
}

const FUNCTION_NAMES = Object.keys(FUNCTIONS)

type Token = { t: 'num'; v: number } | { t: 'ident'; v: string } | { t: 'op'; v: string }

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < src.length && /[0-9.]/.test(src[j])) j += 1
      const text = src.slice(i, j)
      if ((text.match(/\./g) ?? []).length > 1) throw new Error(`数字「${text}」格式不正确`)
      out.push({ t: 'num', v: Number(text) })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i
      while (j < src.length && /[A-Za-z_]/.test(src[j])) j += 1
      out.push({ t: 'ident', v: src.slice(i, j) })
      i = j
      continue
    }
    if ('+-*/%^(),'.includes(ch)) {
      // 把 ** 归一成 ^，两种写法都允许
      if (ch === '*' && src[i + 1] === '*') {
        out.push({ t: 'op', v: '^' })
        i += 2
        continue
      }
      out.push({ t: 'op', v: ch })
      i += 1
      continue
    }
    throw new Error(`不支持的字符「${ch}」`)
  }
  return out
}

/**
 * expr  := term (('+'|'-') term)*
 * term := unary (('*'|'/'|'%') unary)*
 * unary:= ('-'|'+')* power
 * power:= primary ('^' unary)?          右结合
 * primary := number | 'x' | func '(' args ')' | '(' expr ')'
 */
function parse(tokens: Token[], x: number): number {
  let pos = 0
  const peek = () => tokens[pos]
  const eat = (v: string) => {
    const t = peek()
    if (t && t.t === 'op' && t.v === v) {
      pos += 1
      return true
    }
    return false
  }
  const expect = (v: string) => {
    if (!eat(v)) throw new Error(`缺少「${v}」`)
  }

  function primary(): number {
    const t = peek()
    if (!t) throw new Error('表达式意外结束')
    if (t.t === 'num') {
      pos += 1
      return t.v
    }
    if (t.t === 'ident') {
      pos += 1
      if (t.v === 'x') return x
      const fn = FUNCTIONS[t.v]
      if (!fn) throw new Error(`未知符号「${t.v}」，只认 x 和 ${FUNCTION_NAMES.join('/')}`)
      expect('(')
      const args: number[] = [expr()]
      while (eat(',')) args.push(expr())
      expect(')')
      const r = fn(...args)
      if (!Number.isFinite(r)) throw new Error(`${t.v}() 的结果不是有限数`)
      return r
    }
    if (t.t === 'op' && t.v === '(') {
      pos += 1
      const inner = expr()
      expect(')')
      return inner
    }
    throw new Error(`无法解析「${t.v}」`)
  }

  function power(): number {
    const base = primary()
    if (eat('^')) {
      const exp = unary()
      const r = Math.pow(base, exp)
      if (!Number.isFinite(r)) throw new Error('幂运算溢出')
      return r
    }
    return base
  }

  function unary(): number {
    if (eat('-')) return -unary()
    if (eat('+')) return unary()
    return power()
  }

  function term(): number {
    let v = unary()
    for (;;) {
      if (eat('*')) v *= unary()
      else if (eat('/')) {
        const d = unary()
        if (d === 0) throw new Error('除数为 0')
        v /= d
      } else if (eat('%')) {
        const d = unary()
        if (d === 0) throw new Error('取模的除数为 0')
        v %= d
      } else break
    }
    return v
  }

  function expr(): number {
    let v = term()
    for (;;) {
      if (eat('+')) v += term()
      else if (eat('-')) v -= term()
      else break
    }
    return v
  }

  const result = expr()
  if (pos < tokens.length) throw new Error(`多余的「${(peek() as { v: string }).v}」`)
  return result
}

/** 只允许正整数的额度结果 */
function normalize(value: number): number {
  const r = Math.floor(value)
  return r < 0 ? 0 : r
}

/**
 * 用一条公式算出 level 1..topLevel 的额度。
 * 语法错误时返回 { ok: false, error }，错误信息直接可用于界面展示。
 */
export function computeFormula(formula: string, topLevel = 20): FormulaResult {
  const src = formula.trim()
  if (!src) return { ok: false, error: '公式不能为空' }
  // 容忍服务端写法 Math.min(...)，解析层只认裸函数名
  const stripped = src.replace(/\bMath\s*\.\s*/g, '')
  let tokens: Token[]
  try {
    tokens = tokenize(stripped)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '词法错误' }
  }
  if (tokens.length === 0) return { ok: false, error: '公式不能为空' }

  const values: number[] = []
  for (let level = 1; level <= topLevel; level += 1) {
    try {
      const v = parse(tokens, level)
      if (!Number.isFinite(v)) return { ok: false, error: `x=${level} 时结果不是有限数` }
      values.push(normalize(v))
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : `x=${level} 时求值失败` }
    }
  }
  return { ok: true, values }
}

/** 判断两个额度数组是否完全一致，用于「保存后有没有真的生效」 */
export function sameValues(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}
