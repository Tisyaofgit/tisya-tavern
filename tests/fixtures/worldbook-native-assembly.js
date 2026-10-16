// Exact final assembly excerpt from target APK world-info.js.
// Source SHA256 f48277fb75eb082a519f9262600d7bc292692205abaf0a2fe651385c19cab9f8
const sortFn=(a,b)=>b.order-a.order,DEFAULT_DEPTH=4,extension_prompt_roles={SYSTEM:0};
const world_info_position={before:0,after:1,ANTop:2,ANBottom:3,atDepth:4,EMTop:5,EMBottom:6,outlet:7};
const wi_anchor_position={before:0,after:1};
const getRegexedString=s=>s,regex_placement={WORLD_INFO:0};
export function assemble(allActivatedEntries){
    const WIBeforeEntries = [];
    const WIAfterEntries = [];
    const EMEntries = [];
    const ANTopEntries = [];
    const ANBottomEntries = [];
    const WIDepthEntries = [];
    /** @type {{[key: string]: string[]}} */
    const WIOutletEntries = {};

    // Appends from insertion order 999 to 1. Use unshift for this purpose
    // TODO (kingbri): Change to use WI Anchor positioning instead of separate top/bottom arrays
    [...allActivatedEntries.values()].sort(sortFn).forEach((entry) => {
        const regexDepth = entry.position === world_info_position.atDepth ? (entry.depth ?? DEFAULT_DEPTH) : null;
        const content = getRegexedString(entry.content, regex_placement.WORLD_INFO, { depth: regexDepth, isMarkdown: false, isPrompt: true });

        if (!content) {
            console.debug(`[WI] Entry ${entry.uid}`, 'skipped adding to prompt due to empty content', entry);
            return;
        }

        switch (entry.position) {
            case world_info_position.before:
                WIBeforeEntries.unshift(content);
                break;
            case world_info_position.after:
                WIAfterEntries.unshift(content);
                break;
            case world_info_position.EMTop:
                EMEntries.unshift(
                    { position: wi_anchor_position.before, content: content },
                );
                break;
            case world_info_position.EMBottom:
                EMEntries.unshift(
                    { position: wi_anchor_position.after, content: content },
                );
                break;
            case world_info_position.ANTop:
                ANTopEntries.unshift(content);
                break;
            case world_info_position.ANBottom:
                ANBottomEntries.unshift(content);
                break;
            case world_info_position.atDepth: {
                const existingDepthIndex = WIDepthEntries.findIndex((e) => e.depth === (entry.depth ?? DEFAULT_DEPTH) && e.role === (entry.role ?? extension_prompt_roles.SYSTEM));
                if (existingDepthIndex !== -1) {
                    WIDepthEntries[existingDepthIndex].entries.unshift(content);
                } else {
                    WIDepthEntries.push({
                        depth: entry.depth,
                        entries: [content],
                        role: entry.role ?? extension_prompt_roles.SYSTEM,
                    });
                }
                break;
            }
            case world_info_position.outlet: {
                if (!entry.outletName) {
                    console.warn(`[WI] Entry ${entry.uid} has position 'outlet' but no outlet name. Skipping.`);
                    break;
                }
                if (Array.isArray(WIOutletEntries[entry.outletName])) {
                    WIOutletEntries[entry.outletName].push(content);
                } else {
                    WIOutletEntries[entry.outletName] = [content];
                }
                break;
            }
            default:
                break;
        }
    });

    const worldInfoBefore = WIBeforeEntries.length ? WIBeforeEntries.join('\n') : '';
    const worldInfoAfter = WIAfterEntries.length ? WIAfterEntries.join('\n') : '';


return {worldInfoBefore,worldInfoAfter,EMEntries,WIDepthEntries,ANTopEntries,ANBottomEntries,WIOutletEntries};
}
