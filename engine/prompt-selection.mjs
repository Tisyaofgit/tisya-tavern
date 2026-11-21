// Request assembly follows the host's ordered prompt list. Narrative source
// projection deliberately keeps the compiled prompt array order: duplicate
// identifiers and source order are part of its existing projection contract.
export function enabledPresetPrompts(source){
 const order=source.order??source.prompt_order?.find(row=>row.character_id===100001)?.order??source.prompt_order?.[0]?.order;
 return order?order.filter(row=>row.enabled).map(row=>source.prompts?.find(prompt=>prompt.identifier===row.identifier)).filter(prompt=>prompt&&prompt.enabled!==false):(source.prompts??[]).filter(prompt=>prompt.enabled!==false);
}

export function enabledNarrativePrompts(compiled){
 const order=compiled.order??compiled.prompt_order?.find(row=>row.character_id===100001)?.order??[],enabled=new Set(order.filter(row=>row.enabled).map(row=>row.identifier));
 return (compiled.prompts??[]).filter(prompt=>!prompt.marker&&prompt.enabled!==false&&enabled.has(prompt.identifier));
}
