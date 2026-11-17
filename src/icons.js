// Original Podlingua line drawings. Authored locally; no sprites, fonts or requests.
const drawings={
 home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
 discover:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6Z"/>',
 subscriptions:'<path d="M4 5h16M6 2h12M3 8h18v13H3Z"/><path d="m10 12 5 3-5 3Z"/>',
 episodes:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
 inbox:'<path d="M3 13 6 4h12l3 9v7H3Z"/><path d="M3 13h5l2 3h4l2-3h5"/>',
 queue:'<path d="M4 5h16M4 11h12M4 17h8m5-3 5 4-5 4Z"/>',
 favorite:'<path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 history:'<path d="M3 10a9 9 0 1 1 1 7M3 4v6h6m3-4v6l4 3"/>',
 statistics:'<path d="M4 21V11h4v10m2 0V3h4v18m2 0V7h4v14"/>',
 reader:'<path d="M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1Zm0 0v15"/>',
 settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
 audio:'<path d="M5 10v4m4-8v12m4-15v18m4-15v12m4-8v4"/>',
 transcript:'<path d="M5 3h10l4 4v14H5Zm9 0v5h5M8 12h8m-8 4h6"/>',
 translate:'<path d="M3 5h11M8 2v3m-3 0c0 5 3 8 7 10m0-10c0 5-3 8-8 10m10 6 4-11 4 11m-6-4h4"/>',
 play:'<path d="m8 4 12 8-12 8Z"/>',pause:'<path d="M7 4h3v16H7Zm7 0h3v16h-3Z"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 back:'<path d="m10 5-7 7 7 7m-7-7h12a6 6 0 0 1 0 12"/>',
 forward:'<path d="m14 5 7 7-7 7m7-7H9a6 6 0 0 0 0 12"/>',
 bookmark:'<path d="M6 3h12v18l-6-4-6 4Z"/>',
 timer:'<circle cx="12" cy="14" r="8"/><path d="M9 2h6m-3 0v4m0 3v5l3 2"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
};
export function icon(name){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','20');svg.setAttribute('height','20');
 svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
 svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.classList.add('design-icon');
 // Only the fixed, locally authored drawing table is parsed; no caller markup.
 svg.innerHTML=drawings[name]||drawings.more;return svg;
}
/** Prepend decoration only: labels, event listeners and file inputs survive. */
export function decorate(control,name){
 if(!control||control.querySelector(':scope > .design-icon'))return;
 control.prepend(icon(name));control.classList.add('icon-control');
}
