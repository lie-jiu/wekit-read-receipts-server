import type { BasicSession } from "../types";
import { safeJson } from "../../utils";
import { frontendHelpers } from "../shared";
import { sharedStyle } from "../shared-style";
export function leaderboardPage(session: BasicSession): string { return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0f172a" />
    <title data-i18n="title">Leaderboard</title>
    ${sharedStyle()}
    <style>
body {
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  min-height: 100dvh;
  padding: 2rem 1rem;
  padding-top: max(2rem, env(safe-area-inset-top));
  padding-bottom: max(2rem, env(safe-area-inset-bottom));
  padding-left: max(1rem, env(safe-area-inset-left));
  padding-right: max(1rem, env(safe-area-inset-right));
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-strong);
}
.header .subtitle {
  font-size: 0.85rem;
  color: var(--faint);
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.85rem;
  border: none;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  text-decoration: none;
  transition: background 0.15s, box-shadow 0.15s;
}
.btn-primary {
  background: var(--primary);
  color: var(--on-primary);
}
.btn-primary:hover {
  background: var(--primary-hover);
}
.leaderboard {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow-x: auto;
  margin-bottom: 1rem;
}
.leaderboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.scope-btn {
  background: transparent;
  color: var(--muted);
  border: 1px solid var(--border-strong);
}
.scope-btn:hover {
  background: var(--surface);
  color: var(--text);
}
.scope-btn.scope-active {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
}
.rank-col {
  font-weight: 600;
  color: var(--muted);
  width: 3.5rem;
}
.rank-col.rank-1 {
  color: #fbbf24;
}
.rank-col.rank-2 {
  color: var(--text-soft);
}
.rank-col.rank-3 {
  color: #d97706;
}
.wxid-col {
  font-family: ui-monospace, "Cascadia Code", "JetBrains Mono", monospace;
  font-size: 0.78rem;
}
.lb-msg-col {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lb-count-col {
  color: #60a5fa;
  font-weight: 600;
}
.row-me td {
  background: #16324f !important;
  color: #93c5fd;
}
.flex {
  display: flex;
  gap: 0.5rem;
}
.toast-container {
  position: fixed;
  top: max(1rem, env(safe-area-inset-top));
  right: max(1rem, env(safe-area-inset-right));
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.toast {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  animation: toast-in 0.25s ease-out;
  max-width: 360px;
}
.toast-error {
  background: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid var(--danger);
}
@keyframes toast-in {
from {
opacity: 0;
translate: 0 -0.5rem;
}
to {
opacity: 1;
translate: 0;
}
}
.toast-out {
  animation: toast-out 0.2s ease-in forwards;
}
@keyframes toast-out {
to {
opacity: 0;
translate: 0 -0.5rem;
}
}
.repo-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: var(--faint);
  text-decoration: none;
  margin-top: 2rem;
  padding: 0.5rem 0.8rem;
  border-radius: 8px;
  transition: color 0.15s, background 0.15s;
}
@media (max-width: 640px) {
  .leaderboard-header {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }
  .leaderboard-header .flex {
    display: grid;
    width: 100%;
  }
  .leaderboard-header .flex:first-child {
    grid-template-columns: repeat(3, 1fr);
  }
  .leaderboard-header .flex:last-child {
    grid-template-columns: repeat(2, 1fr);
  }
  .scope-btn {
    min-height: 38px;
  }
  .leaderboard {
    padding: 0.5rem;
  }
  .lb-msg-col, .wxid-col, .lb-count-col {
    white-space: normal;
    overflow-wrap: anywhere;
    text-align: right;
  }
  .rank-col {
    width: auto;
  }
  .row-me td {
    background: transparent !important;
  }
  .row-me {
    border-color: var(--primary);
  }
}
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div>
          <h1 data-i18n="leaderboard">Leaderboard</h1>
          <div class="subtitle" data-i18n="lbSubtitle">Top accounts by activity</div>
        </div>
        <div class="flex">
          <span class="user-chip" id="userChip"></span>
          <a class="btn btn-primary btn-sm" href="/" data-i18n="backToMessages">Messages</a>
          <button class="lang-toggle" onclick="toggleLang()">中 / EN</button>
          <button class="theme-toggle" onclick="toggleTheme()"></button>
        </div>
      </div>

      <div class="leaderboard">
        <div class="leaderboard-header">
          <div class="flex">
            <button class="btn btn-sm scope-btn scope-active" id="metricReg" onclick="setMetric('reg')" data-i18n="regBoard">Reg</button>
            <button class="btn btn-sm scope-btn" id="metricRead" onclick="setMetric('read')" data-i18n="readBoard">Reads</button>
            <button class="btn btn-sm scope-btn" id="metricMsg" onclick="setMetric('msg')" data-i18n="msgBoard">Messages</button>
          </div>
          <div class="flex">
            <button class="btn btn-sm scope-btn" id="scopeDay" onclick="setScope('day')" data-i18n="daily">Daily</button>
            <button class="btn btn-sm scope-btn scope-active" id="scopeTotal" onclick="setScope('total')" data-i18n="total">Total</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th data-i18n="rank">Rank</th>
              <th id="lbCol2">Account</th>
              <th id="lbCol3">Messages</th>
              <th id="lbCol4" class="hidden">Reads</th>
            </tr>
          </thead>
          <tbody id="lbTbody"></tbody>
        </table>
      </div>
    </div>

    <a class="repo-footer" href="https://github.com/lie-jiu/wekit-read-receipts-server" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      <span>lie-jiu · GitHub</span>
    </a>

    <div id="toastContainer" class="toast-container"></div>

    <script>
      ${frontendHelpers()}
      const ME = ${safeJson({ wxId: session.wxId, level: session.level })};
      const lbTbody = document.getElementById("lbTbody");
      const lbCol2 = document.getElementById("lbCol2");
      const lbCol3 = document.getElementById("lbCol3");
      const lbCol4 = document.getElementById("lbCol4");
      const toastContainer = document.getElementById("toastContainer");

      /* ── i18n ── */
      let lang = localStorage.getItem("lang") || "zh-CN";

      const translations = {
        "zh-CN": {
          title: "排行榜",
          leaderboard: "排行榜",
          lbSubtitle: "活跃用户与热门消息排行",
          backToMessages: "消息列表",
          regBoard: "注册榜",
          readBoard: "已读榜",
          msgBoard: "消息榜",
          owner: "归属用户",
          daily: "日榜",
          total: "总榜",
          rank: "排名",
          account: "账号",
          themeLight: "浅色",
          themeDark: "深色",
          message: "消息",
          messageCount: "消息数",
          reads: "已读人数",
          loading: "加载中...",
          leaderboardEmpty: "暂无数据",
          networkError: "网络错误",
        },
        en: {
          title: "Leaderboard",
          leaderboard: "Leaderboard",
          lbSubtitle: "Top accounts by activity",
          backToMessages: "Messages",
          regBoard: "Reg",
          readBoard: "Reads",
          msgBoard: "Messages",
          owner: "Owner",
          daily: "Daily",
          total: "Overall",
          rank: "Rank",
          account: "Account",
          themeLight: "Light",
          themeDark: "Dark",
          message: "Message",
          messageCount: "Messages",
          reads: "Reads",
          loading: "Loading...",
          leaderboardEmpty: "No data yet",
          networkError: "Network error",
        },
      };

                  function toggleLang() {
        lang = lang === "zh-CN" ? "en" : "zh-CN";
        localStorage.setItem("lang", lang);
        applyI18n();
        updateLbHeaders();
        setLabels();
      }

      /* ── toast ── */
      function toast(message, type = "info") {
        const el = document.createElement("div");
        el.className = \`toast toast-\${type}\`;
        el.textContent = message;
        toastContainer.appendChild(el);
        setTimeout(() => {
          el.classList.add("toast-out");
        }, 2800);
        setTimeout(() => el.remove(), 3100);
      }

      /* ── leaderboard ── */
      let lbScope = "total";
      let lbMetric = "reg";

      function lbSpan() {
        return lbMetric === "msg" ? 4 : 3;
      }

      function updateLbHeaders() {
        if (lbMetric === "msg") {
          lbCol2.textContent = t("message");
          lbCol3.textContent = t("owner");
          lbCol4.textContent = t("reads");
          lbCol4.classList.remove("hidden");
        } else {
          lbCol2.textContent = t("account");
          lbCol3.textContent = lbMetric === "read" ? t("reads") : t("messageCount");
          lbCol4.classList.add("hidden");
        }
      }

      function setLabels() {
        lbTbody.querySelectorAll("tr:not(.empty-row)").forEach((tr) => {
          const labels = [
            t("rank"),
            lbMetric === "msg" ? t("message") : t("account"),
            lbMetric === "msg"
              ? t("owner")
              : lbMetric === "read"
                ? t("reads")
                : t("messageCount"),
            t("reads"),
          ];
          Array.from(tr.cells).forEach((td, i) => {
            if (labels[i]) td.setAttribute("data-label", labels[i]);
          });
        });
      }

      async function loadLeaderboard() {
        lbTbody.innerHTML =
          '<tr class="empty-row"><td colspan="' +
          lbSpan() +
          '">' +
          esc(t("loading")) +
          "</td></tr>";
        try {
          const res = await fetch("/leaderboard?scope=" + lbScope + "&metric=" + lbMetric);
          if (res.status === 401) {
            location.href = "/";
            return;
          }
          if (!res.ok) {
            lbTbody.innerHTML =
              '<tr class="empty-row"><td colspan="' +
              lbSpan() +
              '">' +
              esc(t("leaderboardEmpty")) +
              "</td></tr>";
            return;
          }
          const data = await res.json();
          if (!data.length) {
            lbTbody.innerHTML =
              '<tr class="empty-row"><td colspan="' +
              lbSpan() +
              '">' +
              esc(t("leaderboardEmpty")) +
              "</td></tr>";
            return;
          }
          const rankCell = (i) => \`<td class="rank-col rank-\${i < 3 ? i + 1 : "x"}">\${i + 1}</td>\`;
          lbTbody.innerHTML = data
            .map((r, i) => {
              if (lbMetric === "msg") {
                return \`<tr class="\${r.me ? "row-me" : ""}">
      \${rankCell(i)}
      <td class="lb-msg-col">\${esc(r.content)}</td>
      <td class="wxid-col">\${esc(r.wxId)}</td>
      <td class="lb-count-col">\${esc(r.count)}</td>
    </tr>\`;
              }
              return \`<tr class="\${r.me ? "row-me" : ""}">
      \${rankCell(i)}
      <td class="wxid-col">\${esc(r.wxId)}</td>
      <td class="lb-count-col">\${esc(r.count)}</td>
    </tr>\`;
            })
            .join("");
        } catch (e) {
          lbTbody.innerHTML =
            '<tr class="empty-row"><td colspan="' +
            lbSpan() +
            '">' +
            esc(t("networkError")) +
            "</td></tr>";
        }
        setLabels();
      }

      function syncLbButtons() {
        document.getElementById("metricReg").classList.toggle("scope-active", lbMetric === "reg");
        document.getElementById("metricRead").classList.toggle("scope-active", lbMetric === "read");
        document.getElementById("metricMsg").classList.toggle("scope-active", lbMetric === "msg");
        document.getElementById("scopeDay").classList.toggle("scope-active", lbScope === "day");
        document.getElementById("scopeTotal").classList.toggle("scope-active", lbScope === "total");
      }

      function setMetric(m) {
        if (lbMetric === m) return;
        lbMetric = m;
        syncLbButtons();
        updateLbHeaders();
        loadLeaderboard();
      }

      function setScope(s) {
        if (lbScope === s) return;
        lbScope = s;
        syncLbButtons();
        loadLeaderboard();
      }

            /* ── init ── */
      document.getElementById("userChip").textContent =
        ME.wxId + " · Lv" + ME.level;
      initTheme();
      applyI18n();
      updateLbHeaders();
      syncLbButtons();
      loadLeaderboard();
    </script>
  </body>
</html>
`; }

