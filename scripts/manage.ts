#!/usr/bin/env bun
/**
 * 服务管理脚本：安装/卸载（开机自启）、启停、管理员/邀请码、用户管理
 *
 * 用法: bun run manage <command> [args]
 * 实现按职责拆分到 scripts/manage/ 目录（platform/env/service/users/levels/cli）。
 */

import { run } from "./manage/cli";

const [cmd = "", ...args] = process.argv.slice(2);
await run(cmd, args);
