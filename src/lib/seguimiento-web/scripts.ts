/**
 * Los dos scripts que corren en la página del cliente.
 *
 * - El CARGADOR (`/t/arca.js`) es lo que se pega. No cambia nunca: lee la
 *   clave del sitio e inyecta el segundo.
 * - El RASTREADOR (`/t/<clave>.js`) lleva la configuración horneada adentro,
 *   así que una página vista cuesta una petición y no dos. Vive 5 minutos en
 *   caché: pausar el sitio surte efecto en ese plazo.
 *
 * Reglas que nada más en este repo tiene, porque corre en la página de otro:
 * - ES5 escrito a mano en una plantilla. Sin dependencias.
 * - NUNCA lanzar. Un error en la línea 40 deja la página sin escuchar nada.
 *   Todo `decodeURIComponent`, `JSON.parse`, `new URL` e `history` va envuelto.
 * - Contraseñas, campos ocultos y archivos no salen nunca del navegador.
 * - Las constantes vienen de `constantes.ts`: el cliente no puede mandar un
 *   lote que el colector vaya a destruir.
 *
 * Adaptado de trycompai/crm (MIT, ver licenses/trycompai-crm.txt).
 */

import {
  COOKIE_PRIMER_ORIGEN,
  COOKIE_VISITANTE,
  MAX_BYTES_CUERPO,
  MAX_EVENTOS_POR_LOTE,
  SEGUNDOS_ENLAZADOR,
  type ConfigSeguimiento,
} from './constantes';

export const FUENTE_CARGADOR = `(function(){
var s=document.currentScript||document.querySelector("script[src*='/t/arca.js']");
if(!s||!s.src)return;
var u;
try{u=new URL(s.src)}catch(e){return}
var site=s.getAttribute("data-site")||u.searchParams.get("site");
if(!site||!/^arc_[0-9a-f]{12}$/.test(site))return;
var id="arca-t-"+site;
if(document.getElementById(id))return;
var t=document.createElement("script");
t.id=id;t.async=!0;t.defer=!0;
t.src=u.origin+"/t/"+site+".js";
(document.head||document.documentElement).appendChild(t);
})();
`;

export function fuenteRastreador(
  config: ConfigSeguimiento,
  endpoint: string
): string {
  return `(function(){
var C=${JSON.stringify(config)},E=${JSON.stringify(endpoint)},N=${JSON.stringify(COOKIE_VISITANTE)},FS=${JSON.stringify(COOKIE_PRIMER_ORIGEN)};
var B=${MAX_BYTES_CUERPO},M=${MAX_EVENTOS_POR_LOTE};
var d=document,w=window,loc=w.location;
if(w.__arcaT)return;w.__arcaT=1;
function host(){return loc.hostname.toLowerCase().replace(/^www\\./,"")}
function base(h){
 for(var i=0;i<C.dominios.length;i++){var x=C.dominios[i];
  if(h===x||(C.incluirSubdominios&&h.slice(-(x.length+1))==="."+x))return x}
 return null}
function allowed(h){return!C.limitarADominios||base(h)!==null}
if(!allowed(host()))return;
if(C.respetarDnt&&(navigator.doNotTrack==="1"||w.doNotTrack==="1"||navigator.globalPrivacyControl))return;
if(navigator.webdriver||d.visibilityState==="prerender")return;
function decode(v){try{return decodeURIComponent(v)}catch(e){return null}}
function readC(k){var m=d.cookie.match(new RegExp("(?:^|; )"+k+"=([^;]*)"));return m?decode(m[1]):null}
function writeC(k,v){
 var p=k+"="+encodeURIComponent(v)+"; path=/; samesite=lax";
 if(C.diasCookie>0)p+="; max-age="+C.diasCookie*86400;
 if(loc.protocol==="https:")p+="; secure";
 var b=C.incluirSubdominios?base(host()):null;
 if(b)p+="; domain=."+b;
 try{d.cookie=p}catch(e){}}
function mint(){
 if(w.crypto&&w.crypto.randomUUID)return w.crypto.randomUUID().replace(/-/g,"");
 return Math.random().toString(36).slice(2)+Date.now().toString(36)}
var existing=readC(N),linked=null;
var lm=loc.hash.match(/_arca=([A-Za-z0-9_-]{8,64})\\.(\\d{10})/);
if(lm){
 var age=Math.floor(Date.now()/1000)-parseInt(lm[2],10);
 if(age>=0&&age<=${SEGUNDOS_ENLAZADOR}&&!existing)linked=lm[1];
 try{history.replaceState(null,"",loc.href.replace(/[#&]_arca=[A-Za-z0-9_.-]+/,""))}catch(e){}}
var vid=linked||existing||mint();
if(!/^[A-Za-z0-9_-]{8,64}$/.test(vid))vid=mint();
writeC(N,vid);
function param(q,k){var m=q.match(new RegExp("[?&]"+k+"=([^&]*)"));if(!m)return undefined;var v=decode(m[1].replace(/\\+/g," "));return v?v.slice(0,120):undefined}
function touch(){
 var q=loc.search,t={landing:loc.pathname.slice(0,120),at:Date.now()};
 var s=param(q,"utm_source"),m=param(q,"utm_medium");
 if(s)t.source=s;
 if(m)t.medium=m;
 var c=param(q,"utm_campaign");if(c)t.campaign=c;
 var tm=param(q,"utm_term");if(tm)t.term=tm;
 var ct=param(q,"utm_content");if(ct)t.content=ct;
 if(!s&&param(q,"gclid")){t.source="Google";t.medium="cpc"}
 if(!s&&param(q,"fbclid")){t.source="Facebook";t.medium=t.medium||"social"}
 var r=d.referrer;
 if(r){try{var rh=new URL(r).hostname.toLowerCase().replace(/^www\\./,"");if(rh!==host()&&base(rh)===null)t.referrer=r.slice(0,300)}catch(e){}}
 return t}
function readFirst(){var v=readC(FS);if(!v)return null;try{return JSON.parse(v)}catch(e){return null}}
var last=touch();
var first=readFirst();
if(!first){first=last;writeC(FS,JSON.stringify(first))}
var q=[],timer=null;
function pack(evts){return JSON.stringify({siteId:C.clave,visitorId:vid,events:evts})}
function bytes(s){try{return new Blob([s]).size}catch(e){return s.length*3}}
function shrink(e,body){
 var keys=e.fields?Object.keys(e.fields):[];
 while(keys.length>1&&bytes(body)>B){delete e.fields[keys.pop()];body=pack([e])}
 return body}
function post(body){
 try{
  if(navigator.sendBeacon&&navigator.sendBeacon(E,new Blob([body],{type:"text/plain"})))return;
  fetch(E,{method:"POST",body:body,keepalive:!0,mode:"no-cors",headers:{"content-type":"text/plain"}})
 }catch(e){}}
function flush(){
 clearTimeout(timer);
 while(q.length){
  var take=q.splice(0,M),body=pack(take);
  while(bytes(body)>B&&take.length>1){q.unshift(take.pop());body=pack(take)}
  if(bytes(body)>B)body=shrink(take[0],body);
  if(bytes(body)<=B)post(body)}}
function send(e){
 e.host=host();e.at=Date.now();
 q.push(e);
 if(q.length>=M){flush();return}
 clearTimeout(timer);timer=setTimeout(flush,2000)}
function view(){send({type:"page_view",path:loc.pathname,referrer:d.referrer||undefined,touch:last})}
function label(el){
 var t=(el.getAttribute("aria-label")||el.textContent||"").replace(/\\s+/g," ").trim();
 return t?t.slice(0,80):undefined}
function onClick(ev){
 var el=ev.target;
 while(el&&el!==d.body){
  if(el.hasAttribute&&el.hasAttribute("data-arca-track")){send({type:"click",path:loc.pathname,label:el.getAttribute("data-arca-track")||label(el)});return}
  if(el.tagName==="A"||el.tagName==="BUTTON"){
   var href=el.getAttribute&&el.getAttribute("href")||"";
   var out=/^(https?:|tel:|mailto:)/i.test(href)&&href.indexOf(loc.origin)!==0;
   if(out||/wa\\.me|whatsapp/i.test(href)||el.tagName==="BUTTON")send({type:"click",path:loc.pathname,label:label(el)});
   return}
  el=el.parentElement}}
function onSubmit(ev){
 var f=ev.target;
 if(!f||f.tagName!=="FORM")return;
 var fields={},n=0;
 for(var i=0;i<f.elements.length&&n<40;i++){
  var el=f.elements[i],name=el.name||el.id;
  if(!name||!el.value)continue;
  var type=(el.type||"").toLowerCase();
  if(type==="password"||type==="hidden"||type==="file"||type==="submit")continue;
  if(type==="checkbox"||type==="radio"){if(!el.checked)continue}
  fields[name]=String(el.value).slice(0,512);n++}
 if(!n)return;
 send({type:"form_submit",path:loc.pathname,fields:fields,touch:last,firstTouch:first});
 flush()}
function decorate(){
 if(C.dominios.length<2)return;
 d.addEventListener("mousedown",function(ev){
  var el=ev.target;
  while(el&&el.tagName!=="A")el=el.parentElement;
  if(!el||!el.href)return;
  var u;try{u=new URL(el.href)}catch(e){return}
  var h=u.hostname.toLowerCase().replace(/^www\\./,"");
  if(h===host()||base(h)===null||base(h)===base(host()))return;
  u.hash=u.hash.replace(/[#&]?_arca=[A-Za-z0-9_.-]+/,"");
  u.hash=(u.hash?u.hash+"&":"")+"_arca="+vid+"."+Math.floor(Date.now()/1000);
  el.href=u.toString()},!0)}
function start(){
 view();
 d.addEventListener("click",onClick,!0);
 d.addEventListener("submit",onSubmit,!0);
 d.addEventListener("visibilitychange",function(){if(d.visibilityState==="hidden")flush()});
 w.addEventListener("pagehide",flush);
 decorate();
 var push=history.pushState,rep=history.replaceState;
 function spa(fn){return function(){var r=fn.apply(this,arguments);setTimeout(view,0);return r}}
 try{history.pushState=spa(push);history.replaceState=spa(rep)}catch(e){}
 w.addEventListener("popstate",view)}
try{if(w.requestIdleCallback)requestIdleCallback(start,{timeout:2000});else setTimeout(start,0)}catch(e){}
})();
`;
}
