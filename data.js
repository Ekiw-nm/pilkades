"use strict";
const CANDIDATES = [
  {id:1,name:"ADE APANDI",x:"7.93%"},
  {id:2,name:"UJANG KARTA",x:"35.93%"},
  {id:3,name:"SUPANDI",x:"64.07%"},
  {id:4,name:"KUSNA SUPRIATNA",x:"92%"}
];
const CFG=window.PILKADES_CONFIG;
const ONLINE=CFG.mode==="online";
const STORE="marengmang-demo-v1";
function initialData(){return {tokens:Object.fromEntries(Array.from({length:20},(_,i)=>["DEMO-"+String(i+1).padStart(3,"0"),null])),counts:[0,0,0,0],receipts:{}};}
function localRead(){const raw=localStorage.getItem(STORE);return raw?JSON.parse(raw):initialData();}
function localWrite(data){localStorage.setItem(STORE,JSON.stringify(data));}
function normalizeToken(value){value=value.trim();try {const u=new URL(value);return (new URLSearchParams(u.hash.slice(1)).get("kode")||u.searchParams.get("kode")||value).trim();}catch{return value;}}
async function rpc(name,args={},accessToken){
  if(!CFG.supabaseUrl.startsWith("https://")||!CFG.supabasePublishableKey)throw Error("Konfigurasi database online belum lengkap. Hubungi petugas.");
  const headers={"Content-Type":"application/json",apikey:CFG.supabasePublishableKey};
  if(accessToken)headers.Authorization="Bearer "+accessToken;
  const response=await fetch(CFG.supabaseUrl.replace(/\/$/,"")+"/rest/v1/rpc/"+name,{method:"POST",headers,body:JSON.stringify(args),signal:AbortSignal.timeout(20000)});
  const body=await response.json();
  if(!response.ok)throw Error(body.message||"Server belum dapat memproses permintaan.");
  return body;
}
// Kode latihan bisa digunakan pada perangkat lain tanpa registrasi lokal.
// Mode online tetap memeriksa kode pada database.
function isSimulationInvitation(token, data) {
  const exampleCode = /^DEMO-(00[1-9]|01[0-9]|020)$/;
  const generatedCode = /^MM-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return Object.hasOwn(data.tokens, token)
    || exampleCode.test(token)
    || generatedCode.test(token);
}

async function validateToken(token) {
  if (ONLINE) {
    const valid = await rpc("check_invitation", { p_token: token });
    if (!valid) {
      throw Error("Kode tidak valid, sudah digunakan, atau pemilihan belum dibuka.");
    }
    return;
  }

  if (!isSimulationInvitation(token, localRead())) {
    throw Error("Kode undangan simulasi tidak valid. Pindai QR undangan dari panel petugas atau gunakan DEMO-010.");
  }
}
async function castVote(token,candidate,receipt){
  if(!Number.isInteger(candidate)||candidate<1||candidate>4)throw Error("Pilih calon terlebih dahulu.");
  if(ONLINE)return rpc("cast_ballot",{p_token:token,p_candidate:candidate,p_receipt:receipt});
  const save=()=>{
    const d=localRead();
    if (!isSimulationInvitation(token, d)) {
      throw Error("Kode undangan simulasi tidak valid.");
    }
    if(!d.receipts)d.receipts=Object.fromEntries(Object.values(d.tokens).filter(Boolean).map(r=>[r,true]));
    if(Object.hasOwn(d.receipts,receipt)||Object.values(d.tokens).includes(receipt))return true;
    d.receipts[receipt]=true;
    d.tokens[token]=receipt;d.counts[candidate-1]++;localWrite(d);return true;
  };
  return navigator.locks?navigator.locks.request(STORE,save):save();
}
function candidateCard(c,interactive=true){
  const el=document.createElement(interactive?"button":"div");
  el.className="candidate";if(c.x)el.style.setProperty("--x",c.x);
  if(interactive){el.type="button";el.setAttribute("aria-pressed","false");el.setAttribute("aria-label","Nomor "+c.id+", "+c.name);}
  el.innerHTML='<span class="number">'+c.id+'</span><span class="portrait" role="img" aria-label="'+c.name+'"></span><span class="name">'+c.name+'</span>';
  if(c.avatar){const portrait=el.querySelector(".portrait");portrait.classList.add("avatar");portrait.style.backgroundImage="url("+c.avatar+")";}
  return el;
}
function downloadFile(name,text,type="text/plain"){
  const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
