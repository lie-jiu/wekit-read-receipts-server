# wekit-read-insights

「已读回执」服务的界面 SPA（React 19 + Vite + Spark Design），构建为静态产物由服务端两种运行时托管
（Bun 读磁盘上的 `SPA_DIST` / Cloudflare Workers 走 `wrangler.jsonc` 的 assets 绑定）。
部署形态、环境变量与端点说明都在仓库根目录的 [README](../README.md)，这里只记本目录自己的命令。

本目录是独立工程：有自己的 `package.json` / `bun.lock` / `node_modules`，并被根 `tsconfig.json` 排除。

```bash
bun install          # 首次
bun run dev          # vite 开发服务器（5173；API 代理到 127.0.0.1:8787，需先起服务端）
bun run typecheck    # tsc --noEmit
bun run lint         # oxlint
bun run build        # 产物 → dist/（被 .gitignore 排除；任何部署前都要先跑一次）
```

> `vite.config.ts` 把 sparkdesign 的 markdown / lottie 依赖链打成桩件以控制主包体积，
> 动机与护栏见根 README 的「为什么 vite.config 里把 lottie-react / react-markdown 打成了桩件」。
