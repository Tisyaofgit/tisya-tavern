// Reading surfaces follow the selected water palette without frame-by-frame flicker.
export function readingPalette(effects={}){
 return effects.底图色调==='明潮'
  ? {'--tisya-surface-fill':'rgba(7,29,31,.80)','--tisya-paper-opacity':'.14'}
  : {'--tisya-surface-fill':'rgba(3,23,15,.84)','--tisya-paper-opacity':'.21'};
}
export function setReadingPalette(style,effects){for(const [key,value]of Object.entries(readingPalette(effects)))style.setProperty(key,value);}
