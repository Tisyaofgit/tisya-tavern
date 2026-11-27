export const preferenceStyles=`
.tisya-preferences{--pref-border:#b7c3a12e;--pref-muted:#a6b9ae}
#tisya-shell .tisya-preferences .preference-intro{font-size:13px;color:var(--pref-muted);line-height:1.7;margin:0 0 16px}
#tisya-shell .tisya-preferences .preference-toolbar{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:0 14px;margin-bottom:16px}
#tisya-shell .tisya-preferences .preference-toolbar label{margin:5px 0!important;font-size:12px;letter-spacing:.04em}
#tisya-shell .tisya-preferences [data-preference-section]>summary{padding:15px 2px;color:#dfd1a2;font-size:15px;border-bottom:1px solid var(--pref-border);letter-spacing:.06em}
#tisya-shell .tisya-preferences [data-preference-group]{margin:15px 0;padding:12px 14px 14px;border:1px solid var(--pref-border);border-radius:12px;background:linear-gradient(125deg,#18403369,#09271e35)}
#tisya-shell .tisya-preferences [data-preference-group]>legend{padding:0 7px;color:#e1d8b5;font-size:15px;letter-spacing:.02em}
#tisya-shell .tisya-preferences .tisya-select{border-radius:8px;padding:10px 36px 10px 12px;min-height:46px;background:#0b2b23;border-color:#b9a66d45;font-size:15px}
#tisya-shell .tisya-preferences .preference-tag-results{display:grid;gap:8px;width:100%;max-width:100%;min-width:0;box-sizing:border-box;max-height:min(30rem,55dvh);overflow:auto;overscroll-behavior:contain;padding:4px}
#tisya-shell .tisya-preferences .preference-tag-option{display:grid;grid-template-columns:24px minmax(0,1fr);align-items:start;gap:10px;width:100%;max-width:100%;min-width:0;box-sizing:border-box;margin:0!important;padding:12px;border:1px solid var(--pref-border);border-radius:9px;background:#0b2b23;cursor:pointer}
#tisya-shell .tisya-preferences .preference-tag-option:has(input:checked){border-color:#c8b78599;background:#173e31}
#tisya-shell .tisya-preferences .preference-tag-option>input{width:20px;height:20px;margin:2px 0 0;accent-color:#c8b785}
#tisya-shell .tisya-preferences .preference-tag-copy{display:grid;gap:4px;min-width:0;max-width:100%;overflow-wrap:anywhere;word-break:break-word}
#tisya-shell .tisya-preferences .preference-tag-copy>strong{color:#e1d8b5;font-size:14px;font-weight:500;line-height:1.5}
#tisya-shell .tisya-preferences .preference-tag-copy>small{color:var(--pref-muted);font:11px/1.55 ui-monospace,monospace;white-space:normal}
#tisya-shell .tisya-preferences .preference-tag-selection,#tisya-shell .tisya-preferences .preference-tag-result-count{margin:9px 2px;color:var(--pref-muted);font-size:12px;line-height:1.65;overflow-wrap:anywhere}
#tisya-shell .tisya-preferences [data-preference-section="tag-library"]>.menu_button{width:100%;min-height:44px;margin:4px 0 8px;white-space:normal}
#tisya-shell .tisya-preferences .preference-actions{display:flex;gap:5px 12px;flex-wrap:wrap;align-items:center}
#tisya-shell .tisya-preferences .preference-actions:empty{display:none}
#tisya-shell .tisya-preferences .preference-actions>.menu_button{background:none;border:0;border-radius:4px;margin:0;padding:6px 0;font-size:12px;color:#b9c5ad;min-height:36px}
#tisya-shell .tisya-preferences .preference-actions>.menu_button:disabled{display:none}
#tisya-shell .tisya-preferences [data-preference-text-source]{font-size:11px;color:#b7b58d;margin:7px 0 4px;letter-spacing:.04em}
#tisya-shell .tisya-preferences .preference-excerpt{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;white-space:pre-wrap;font:inherit;font-size:13px;line-height:1.75;color:#bacabd;margin:0 0 6px}
#tisya-shell .tisya-preferences [data-preference-text]{margin:0;border-top:1px solid #b7c3a120}
#tisya-shell .tisya-preferences [data-preference-text]>summary{font-size:12px;color:#d0c493;padding:10px 0;min-height:40px}
#tisya-shell .tisya-preferences [data-preference-group]:has([data-preference-text][open]) .preference-excerpt{display:none}
#tisya-shell .tisya-preferences textarea{font-size:15px;line-height:1.85;border-radius:8px;padding:12px;background:#06251e;max-height:55dvh;scrollbar-width:thin}
#tisya-shell .tisya-preferences [data-preference-text] label{font-size:12px;margin:10px 0!important}
#tisya-shell .tisya-preferences [data-preference-text] small{display:block;font-size:11px;line-height:1.7;color:var(--pref-muted)}
#tisya-shell .tisya-preferences [data-preference-text] .menu_button{font-size:12px;border-radius:7px;padding:8px 11px;min-height:40px}
#tisya-shell .tisya-preferences [data-preference-tools]{border-top:1px solid var(--pref-border);margin-top:10px}
#tisya-shell .tisya-preferences .tisya-check-row{font-size:13px;padding:7px 0;margin:0!important;border-bottom:1px solid #b7c3a115;gap:12px}
#tisya-shell .tisya-preferences .preference-section-note{padding:16px 2px 0}
#tisya-shell .tisya-preferences .preference-section-note h3{font-size:14px;margin:0;color:#d6c491}
#tisya-shell .tisya-preferences .preference-section-note p{font-size:12px;line-height:1.7;color:var(--pref-muted);margin:5px 0}
#tisya-shell .tisya-preferences [data-avatar-summary] p{font-size:12px;color:var(--pref-muted)}
#tisya-shell .tisya-matrix-config .tisya-settings-actions{border-top-color:#b7c3a140;background:#0a2c22;padding-inline:0;gap:8px}
#tisya-shell .tisya-matrix-config .tisya-settings-actions button{border-radius:8px;background:#153c2e;border-color:#b9a66d55;font-size:13px}
#tisya-shell .tisya-matrix-config .tisya-settings-actions button:last-child{color:#f0e4bd;background:#34503b;border-color:#c8b78588}
#tisya-shell .tisya-matrix-content{scrollbar-width:thin;scrollbar-color:#7f968666 transparent}
`;
