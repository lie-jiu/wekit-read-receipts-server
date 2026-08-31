export function adminStyle(): string {
  return `<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;min-height:100dvh;padding:2rem 1rem;padding-top:max(2rem,env(safe-area-inset-top));padding-bottom:max(2rem,env(safe-area-inset-bottom));padding-left:max(1rem,env(safe-area-inset-left));padding-right:max(1rem,env(safe-area-inset-right))}
.container{max-width:1000px;margin:0 auto}
.header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;flex-wrap:wrap;gap:.75rem}
.header h1{font-size:1.5rem;font-weight:700;color:#f1f5f9}
.header .subtitle{font-size:.85rem;color:#64748b}
.flex{display:flex;gap:.5rem;align-items:center}
.btn{display:inline-flex;align-items:center;gap:.35rem;padding:.45rem .85rem;border:none;border-radius:6px;font-size:.8rem;font-weight:500;cursor:pointer;white-space:nowrap;text-decoration:none;transition:background .15s}
.btn:active{transform:scale(.97)}
.btn-primary{background:#2563eb;color:#fff}.btn-primary:hover{background:#1d4ed8}
.btn-secondary{background:#475569;color:#e2e8f0}.btn-secondary:hover{background:#64748b}
.btn-danger{background:#b91c1c;color:#fff}.btn-danger:hover{background:#991b1b}
.btn-outline{background:transparent;color:#94a3b8;border:1px solid #475569}
.btn-outline:hover{background:#1e293b;color:#e2e8f0}
.btn-sm{padding:.3rem .6rem;font-size:.75rem}
.lang-toggle{font-size:.7rem;font-weight:600;padding:.25rem .5rem;border-radius:4px;background:transparent;color:#64748b;border:1px solid #475569;cursor:pointer;letter-spacing:.03em}
.lang-toggle:hover{color:#e2e8f0;border-color:#94a3b8}
.tabs{display:flex;gap:.4rem;margin-bottom:1rem}
.tab{padding:.5rem 1rem;border:1px solid #475569;border-radius:6px;background:transparent;color:#94a3b8;font-size:.85rem;font-weight:600;cursor:pointer;transition:background .15s,color .15s}
.tab.active{background:#2563eb;border-color:#2563eb;color:#fff}
.controls{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:.75rem 1rem}
.controls input{padding:.45rem .7rem;border:1px solid #475569;border-radius:6px;font-size:.85rem;background:#0f172a;color:#e2e8f0;outline:none;transition:border-color .15s;min-width:180px}
.controls input:focus{border-color:#3b82f6}
.controls .sep{color:#475569;font-size:.8rem;padding:0 .15rem}
.table-wrapper{background:#1e293b;border:1px solid #334155;border-radius:10px;overflow:hidden}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:.65rem 1rem;font-size:.825rem}
th{background:#0f172a;font-weight:600;color:#94a3b8;border-bottom:1px solid #334155}
td{border-bottom:1px solid #1e293b;color:#cbd5e1}
tr:last-child td{border-bottom:none}
tr:hover td{background:#0f172a80}
.uuid-col{font-family:ui-monospace,"Cascadia Code","JetBrains Mono",monospace;font-size:.78rem;color:#60a5fa}
.msg-col{max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.ts-col{color:#94a3b8;white-space:nowrap}
.empty-row td{text-align:center;padding:2.5rem 1rem;color:#475569;font-size:.85rem}
.pagination{display:flex;align-items:center;justify-content:center;gap:.35rem;flex-wrap:wrap;padding:.65rem 1rem;border-top:1px solid #334155;background:#0f172a}
.pagination:empty{display:none}
.page-btn{min-width:2rem;height:2rem;padding:0 .5rem;border:1px solid #475569;border-radius:6px;background:transparent;color:#94a3b8;font-size:.8rem;cursor:pointer;transition:background .15s,color .15s}
.page-btn:hover:not(:disabled){background:#1e293b;color:#e2e8f0}
.page-btn:disabled{opacity:.4;cursor:not-allowed}
.page-btn.page-active{background:#2563eb;border-color:#2563eb;color:#fff}
.page-btn.page-ellipsis{border:none;background:transparent;cursor:default}
.page-size-select{margin-left:.5rem;padding:.25rem .4rem;border:1px solid #475569;border-radius:6px;background:#0f172a;color:#e2e8f0;font-size:.8rem;outline:none}
.page-size-select:focus{border-color:#3b82f6}
.page-info{color:#64748b;font-size:.78rem;margin-left:.5rem}
.stats{display:flex;align-items:center;justify-content:space-between;padding:.5rem 1rem;background:#0f172a;border-bottom:1px solid #334155;font-size:.78rem;color:#64748b}
.stats .count{color:#94a3b8;font-weight:600}
.level-editor{display:inline-flex;align-items:center;gap:.25rem}
.level-editor .btn{padding:.2rem .55rem;line-height:1;font-size:.85rem}
.level-input{width:3.2rem;text-align:center;padding:.25rem .3rem;border:1px solid #475569;border-radius:6px;background:#0f172a;color:#e2e8f0;font-size:.8rem;outline:none;-moz-appearance:textfield}
.level-input::-webkit-outer-spin-button,.level-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.level-input:focus{border-color:#3b82f6}
.retention-input{width:7rem;text-align:center;padding:.35rem .5rem;border:1px solid #475569;border-radius:6px;background:#0f172a;color:#e2e8f0;font-size:.85rem;outline:none;font-variant-numeric:tabular-nums}
.retention-input:focus{border-color:#3b82f6}
.section-sep{margin:1.25rem 0;border:none;border-top:1px solid #334155;}
.toast-container{position:fixed;top:max(1rem,env(safe-area-inset-top));right:max(1rem,env(safe-area-inset-right));z-index:1000;display:flex;flex-direction:column;gap:.5rem}
.levels-hint{font-size:.78rem;color:#64748b;line-height:1.5}
.levels-hint b{color:#94a3b8}
.level-formula{width:100%;min-width:220px;padding:.45rem .7rem;border:1px solid #475569;border-radius:6px;font-size:.85rem;background:#0f172a;color:#e2e8f0;outline:none}
.level-formula:focus{border-color:#3b82f6}
.lv-preview-col{text-align:right;font-variant-numeric:tabular-nums}
.toast{display:flex;align-items:center;gap:.5rem;padding:.65rem 1rem;border-radius:8px;font-size:.85rem;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,.4);animation:toast-in .25s ease-out;max-width:360px}
.toast-success{background:#065f46;color:#a7f3d0;border:1px solid #059669}
.toast-error{background:#7f1d1d;color:#fecaca;border:1px solid #dc2626}
.toast-info{background:#1e3a5f;color:#bfdbfe;border:1px solid #2563eb}
@keyframes toast-in{from{opacity:0;translate:0 -.5rem}to{opacity:1;translate:0}}
.toast-out{animation:toast-out .2s ease-in forwards}
@keyframes toast-out{to{opacity:0;translate:0 -.5rem}}
.modal-overlay{position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;animation:fade-in .15s ease-out}
@keyframes fade-in{from{opacity:0}to{opacity:1}}
.modal{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:1.5rem;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.5)}
.modal h3{font-size:1.1rem;font-weight:600;margin-bottom:.5rem}
.modal p{font-size:.875rem;color:#94a3b8;margin-bottom:1.25rem;line-height:1.5}
.modal .actions{display:flex;gap:.5rem;justify-content:flex-end}
.modal-form input{width:100%;padding:.55rem .7rem;border:1px solid #475569;border-radius:6px;font-size:.9rem;background:#0f172a;color:#e2e8f0;outline:none;margin-bottom:.6rem;transition:border-color .15s}
.modal-form input:focus{border-color:#3b82f6}
.detail-row td{border-bottom:1px solid #334155;background:#0b1220;padding:.4rem 1rem}
.detail-row td:last-child{border-bottom:1px solid #334155}
.detail-card{margin:.5rem 0 .5rem 1.5rem;border:1px solid #334155;border-radius:10px;background:#111c33;padding:.85rem 1rem;animation:fade-in .15s ease-out}
.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55rem 1.5rem}
.detail-item{display:flex;flex-direction:column;gap:.15rem}
.detail-label{font-size:.72rem;color:#64748b;font-weight:600;letter-spacing:.02em}
.detail-value{font-size:.9rem;color:#e2e8f0;font-variant-numeric:tabular-nums;word-break:break-word}
.detail-value .uuid-col{font-size:.82rem}
.detail-actions{margin-top:.75rem;display:flex;gap:.5rem}
.expand-btn{display:inline-flex;align-items:center;justify-content:center;width:1.6rem;height:1.6rem;border:none;border-radius:6px;background:transparent;color:#94a3b8;cursor:pointer;font-size:.8rem;transition:background .15s,color .15s,transform .15s;flex-shrink:0}
.expand-btn:hover{background:#1e293b;color:#e2e8f0}
.expand-btn:active{transform:scale(.92)}
.expand-icon{display:inline-block;transition:transform .2s ease}
tr.expanded .expand-icon{transform:rotate(90deg)}
.msg-list{margin-top:.75rem;border-top:1px solid #1e293b;padding-top:.6rem;display:flex;flex-direction:column;gap:.4rem}
.msg-list-item{display:flex;flex-direction:column;gap:.15rem;padding:.5rem .65rem;background:#0f172a;border:1px solid #1e293b;border-radius:8px;cursor:pointer;transition:border-color .15s,background .15s}
.msg-list-item:hover{background:#111c33;border-color:#334155}
.msg-list-content{font-size:.85rem;color:#cbd5e1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.msg-list-meta{display:flex;gap:.75rem;font-size:.72rem;color:#64748b}
.msg-list-meta .reads{color:#059669;font-weight:600}
.msg-list-empty{font-size:.82rem;color:#64748b;padding:.25rem 0}
.hidden{display:none !important}
.repo-footer{display:flex;align-items:center;justify-content:center;gap:.4rem;font-size:.78rem;color:#64748b;text-decoration:none;margin-top:2rem;padding:.5rem .8rem;border-radius:8px;transition:color .15s,background .15s}
.repo-footer:hover{color:#e2e8f0;background:#1e293b}
.repo-footer svg{width:16px;height:16px;flex-shrink:0}
@media (max-width:640px){body{padding:1rem .75rem}.header{flex-direction:column;align-items:stretch}.header .flex{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr))}.header .btn,.header .lang-toggle{width:100%;justify-content:center;min-height:40px}.tabs{display:grid;grid-template-columns:1fr 1fr}.tab{min-height:42px}.controls{flex-direction:column;align-items:stretch}.controls input{min-width:0;width:100%;min-height:44px}.btn{min-height:40px}.table-wrapper{padding:.5rem}table{display:block}thead{display:none}tbody{display:block}tbody tr{display:block;background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.25rem 0;margin-bottom:.6rem}tbody tr:hover td,tbody tr:last-child td{background:transparent}tbody tr td{display:flex;align-items:center;justify-content:space-between;gap:.75rem;border-bottom:1px solid #1e293b;padding:.5rem .75rem;font-size:.8rem}tbody tr td:last-child{border-bottom:none}tbody tr td::before{content:attr(data-label);color:#64748b;font-weight:600;font-size:.72rem;flex-shrink:0}tbody tr td .flex{flex-wrap:nowrap}.uuid-col,.ts-col{white-space:normal;overflow-wrap:anywhere;text-align:right}.msg-col{max-width:none;white-space:normal;text-align:right;overflow-wrap:anywhere}.empty-row{border:1px dashed #334155;background:transparent !important}.empty-row td{justify-content:center;text-align:center;color:#64748b}.empty-row td::before{display:none}.level-input{font-size:1rem}.modal{max-width:94vw;width:94vw;padding:1.25rem}.modal .actions{flex-direction:column-reverse}.modal .actions .btn{width:100%;justify-content:center;min-height:44px}.modal-form input{min-height:44px}.toast-container{left:1rem;align-items:stretch}.toast{max-width:100%}.detail-row{border:1px dashed #334155;background:transparent !important;margin-bottom:.6rem;border-radius:10px}.detail-row td{display:block;border:none;padding:.25rem .5rem}.detail-row td::before{display:none}.detail-card{margin:.5rem .4rem;padding:.75rem .85rem}.detail-grid{grid-template-columns:1fr}.expand-btn{width:2rem;height:2rem;min-width:40px;min-height:40px;font-size:.95rem}.msg-list-item{min-height:44px}.pagination{gap:.25rem}.page-info{width:100%;text-align:center;margin-left:0;margin-top:.25rem}}
</style>`;
}
