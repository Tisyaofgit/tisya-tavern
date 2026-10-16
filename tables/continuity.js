// Tables own long-term context only when explicitly selected. This projection
// does not overwrite the user's saved hybrid-mode material selections.
export const isTableContinuity=world=>world.tables?.enabled===true&&world.tables?.continuity==='tables';
export function configureTableContinuity(world){
 if(!isTableContinuity(world))return world;
 world.context={...world.context,owner:'tisya',card:false,persona:false,books:[],entries:[]};
 world.controller=null;world.focus=[];
 return world;
}
export const continuityWorld=world=>configureTableContinuity(structuredClone(world));
