import { site } from "@/content/site";

/**
 * Runs synchronously in <head>, before the first paint, and decides how the page opens:
 *
 *   pending  – the intro will play; the finished headline and UI stay hidden until it starts
 *   reduced  – prefers-reduced-motion: a quiet opacity-only reveal (CSS)
 *   skip     – show the finished page immediately (deep links, other routes, ?intro=off,
 *              forced colours, old browsers)
 *   (absent) – no JavaScript: the finished page renders as-is
 *
 * While pending it also:
 *   - preloads the large prints that open the intro (only for visitors who will see it),
 *   - lets "Skip intro" (click) and Esc work even before React has hydrated,
 *   - arms a failsafe: if the engine never starts, "pending" flips to "skip" so the page
 *     can never get stuck blank. The engine cancels it once it commits.
 */
export function gateScript(): string {
  const enabled = site.intro.enabled;
  const dev = process.env.NODE_ENV !== "production";
  const prints = JSON.stringify(site.mosaic.heroPrints.map((p) => p.src));
  return `(function(){try{
var d=document.documentElement,w=window,q=location.search,h=location.hash;
var debug=/[?&]intro=debug/.test(q);
var force=/[?&]intro=(1|force|debug)/.test(q)||((${dev}||debug)&&/[?&]t=/.test(q));
var off=/[?&]intro=(0|off)/.test(q)||!${enabled};
var deep=!!h&&h!=="#"&&h!=="#top";
var home=location.pathname==="/";
var mm=function(x){return !!(w.matchMedia&&matchMedia(x).matches);};
var m=!home||mm("(forced-colors: active)")?"skip":force?"pending":(off||deep)?"skip":mm("(prefers-reduced-motion: reduce)")?"reduced":"pending";
if(m==="pending"&&!("animate" in Element.prototype))m="skip";
d.setAttribute("data-intro",m);
if(m!=="pending")return;
if("scrollRestoration" in history)history.scrollRestoration="manual";
var sb=d.style.scrollBehavior;d.style.scrollBehavior="auto";w.scrollTo(0,0);d.style.scrollBehavior=sb;
${prints}.forEach(function(s){var l=document.createElement("link");l.rel="preload";l.as="image";l.href=s;document.head.appendChild(l);});
var skip=function(){if(d.getAttribute("data-intro")==="pending")d.setAttribute("data-intro","skip");};
document.addEventListener("click",function(e){var t=e.target;if(t&&t.closest&&t.closest(".intro-skip"))skip();},true);
document.addEventListener("keydown",function(e){if(e.key==="Escape")skip();},true);
if(${dev})return;
var arm=function(){w.__introFailsafe=setTimeout(skip,6000);};
if(document.visibilityState==="visible")arm();else document.addEventListener("visibilitychange",function f(){if(document.visibilityState==="visible"){document.removeEventListener("visibilitychange",f);arm();}});
}catch(e){document.documentElement.setAttribute("data-intro","skip");}})();`;
}