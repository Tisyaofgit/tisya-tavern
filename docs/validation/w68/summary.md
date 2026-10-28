# Complete water-panel artwork

The user rejected the W66 polygon surface on the actual phone and asked for a finished full background image. The rejected look remains recorded as rejected; local tests did not establish visual acceptance.

Generated one complete panel with the built-in image-generation tool, retaining its original and copying the unchanged PNG into `assets/actions/water-panel.png`. Dimensions: 2022 × 778, RGBA, fully decoded, alpha range 0–255, transparent outer corner. Hash and exact asset metadata are in `asset.json`.

The full asset is consumed as a nine-slice border image with its center filled. This keeps the fluid corners and upper/lower contours while the middle stretches for variable text height. The polygon and separate top-strip decoration are removed. Live text, numbers, action type, annotations and input/send behavior retain their own DOM layers. Annotations sit below the image to avoid its luminous lower rim. Selected and pressed states brighten the same asset; they do not replace it with a flat surface. The existing click glow and reduced-motion behavior remain.

## Verification

- Final `npm test`: 1317 passed, zero failed, including build/preset reproducibility.
- Chromium 138 at widths 320/360/430/900: real font, no horizontal overflow, one tap/one execution, click glow, reduced motion and zero page errors.
- Six-option long-text case: all six rows present, actual text Range bounds stay inside their content rectangles, no horizontal overflow, and the resolved image source is water-panel.png.
- The first long-text fixture used scrollHeight and incorrectly counted the decorative pseudo-element's outward bleed as clipping. It was replaced with actual text Range bounds; no application truncation was observed.
- Actual rendered normal and selected controls were inspected. `actions-360.jpg` is a neutral action-only preview; the user's screenshot and story are excluded.
- The previous phone screenshot demonstrates the old look's failure. The new candidate has browser evidence; Android visual acceptance remains for the user to assess after updating.

The same release includes the W67 narrative composition and prompt-writing rule. No incomplete .10 branch was published during interruptions; public .9 remained active until the guarded final update.

## Generation prompt

Create one production UI background asset: a complete empty horizontal action-card surface for an elegant dark underwater fantasy reading interface. A suspended lens of deep emerald seawater, long flowing asymmetrical silhouette with softly undulating contours, translucent smoky green glass depth, delicate pale antique-gold glints tracing the entire top AND bottom waterline and softly dissolving edges. The shape feels liquid and weightless, with a subtle curling left end and softly tapering right end; finely rendered water-caustic detail stays near the perimeter. Very dark quiet central 75 percent for readable ivory live text. Refined, unusual, restrained, beautiful. Horizontal approximately 2.6:1 panel, straight-on flat graphic usable as a UI texture, fully contained with clear transparent margin on all sides. Render the whole filled panel and all its contours as one cohesive asset, not a decorative top strip. Outside is genuinely transparent alpha. Empty surface: no lettering, numbers, icons, characters, scenery or additional panels. Organic curved water contours, not a polygon, not paper, not an angular leaf. High-resolution PNG.
