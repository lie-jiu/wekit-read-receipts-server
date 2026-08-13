/*
 * 一次性脚本：为存量已读记录补全运营商双语短名。
 *
 * - isp 为英文原始串（迁移前规则）→ classifyIsp 转成 {cn, en} 短名分别写入 isp / isp_en
 * - isp 已是中文短名 → 仅按已知映射补 isp_en
 * 运行：bun run backfill-isp
 */
import { migrate, sqlite } from "../src/db";
import { classifyIsp } from "../src/geo";

migrate();

const CN_TO_EN: Record<string, string> = {
  中国移动: "China Mobile",
  中国联通: "China Unicom",
  中国电信: "China Telecom",
  中国广电: "China Broadnet",
  教育网: "CERNET",
  鹏博士: "Dr. Peng",
  长城宽带: "Great Wall Broadband",
};

const rows = sqlite
  .query("SELECT rowid, isp, isp_en FROM reads WHERE isp <> '' OR isp_en <> ''")
  .all() as Array<{ rowid: number; isp: string; isp_en: string }>;

let updated = 0;
let skipped = 0;

for (const r of rows) {
  if (/[\u4e00-\u9fff]/.test(r.isp)) {
    const en = CN_TO_EN[r.isp.trim()];
    if (en && en !== r.isp_en) {
      sqlite.query("UPDATE reads SET isp_en = ? WHERE rowid = ?").run(en, r.rowid);
      updated++;
    } else {
      skipped++;
    }
    continue;
  }
  const c = classifyIsp(r.isp);
  if (c.cn === r.isp && c.en === r.isp_en) {
    skipped++;
    continue;
  }
  sqlite.query("UPDATE reads SET isp = ?, isp_en = ? WHERE rowid = ?").run(c.cn, c.en, r.rowid);
  updated++;
}

console.log(`backfill-isp: updated ${updated} row(s), skipped ${skipped}`);
process.exit(0);