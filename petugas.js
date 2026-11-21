"use strict";
const $=id=>document.getElementById(id);
let accessToken="",stats=null,tickets=[],working=false;
$("mode").textContent=ONLINE?"DATABASE ONLINE":"SIMULASI LOKAL";
$("notice").textContent=ONLINE?"Rekap hanya dapat diakses oleh akun petugas.":"Mode percobaan: data hanya dari browser ini. QR dapat dipakai berulang. Total suara menghitung sesi latihan, bukan jumlah warga unik. Panel simulasi tidak memakai kata sandi.";
["backup","restore-label","reset"].forEach(id=>$(id).hidden=ONLINE);
$("online-controls").hidden=!ONLINE;
async function task(fn){if(working)return;working=true;$("error").textContent="";try{await fn();}catch(e){$("error").textContent=e.message;}finally{working=false;}}
async function refresh(){
  stats=ONLINE?await rpc("admin_summary",{},accessToken):(()=>{const d=localRead();return {counts:d.counts,issued:Object.keys(d.tokens).length,used:Object.values(d.tokens).filter(Boolean).length,open:true};})();
  const sum=stats.counts.reduce((a,b)=>a+b,0);
  $("results").replaceChildren();
  CANDIDATES.forEach((c,i)=>{const tr=document.createElement("tr");[c.id,c.name,stats.counts[i],sum?(100*stats.counts[i]/sum).toFixed(1)+"%":"0%"].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.append(td);});$("results").append(tr);});
  $("total").textContent="Total suara: "+sum+" · Undangan: "+stats.issued+(ONLINE?" · Sudah digunakan: ":" · Kode pernah dipakai: ")+stats.used+(ONLINE?" · Status: "+(stats.open?"DIBUKA":"DITUTUP"):"");
}
$("login").onsubmit=e=>{e.preventDefault();task(async()=>{
  if(!CFG.supabaseUrl.startsWith("https://")||!CFG.supabasePublishableKey)throw Error("Isi konfigurasi Supabase terlebih dahulu.");
  const res=await fetch(CFG.supabaseUrl.replace(/\/$/,"")+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"Content-Type":"application/json",apikey:CFG.supabasePublishableKey},body:JSON.stringify({email:$("email").value,password:$("password").value})});
  const body=await res.json();if(!res.ok)throw Error(body.msg||body.error_description||"Login gagal.");
  accessToken=body.access_token;$("password").value="";await refresh();$("login-panel").hidden=true;$("dashboard").hidden=false;$("logout").hidden=false;
});};
$("logout").onclick=()=>{accessToken="";stats=null;tickets=[];$("tickets").replaceChildren();$("results").replaceChildren();$("dashboard").hidden=true;$("login-panel").hidden=false;};
$("refresh").onclick=()=>task(refresh);
$("xlsx").onclick=()=>task(async()=>{
  $("xlsx").disabled=true;
  try{
    await refresh();
    if(!window.PilkadesXlsx)throw Error("Modul Excel belum dimuat. Tekan Ctrl+F5 dan coba kembali.");
    const bytes=PilkadesXlsx.build(CANDIDATES,stats,ONLINE);
    downloadFile("Rekap_Pilkades_Marengmang_"+new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Jakarta"})+".xlsx",bytes,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }finally{$("xlsx").disabled=false;}
});
$("backup").onclick=()=>downloadFile("cadangan-simulasi.json",JSON.stringify(localRead(),null,2),"application/json");
$("restore").onchange=e=>task(async()=>{
  const file=e.target.files[0];if(!file)return;const d=JSON.parse(await file.text());
  if(!d||!Array.isArray(d.counts)||d.counts.length!==4||d.counts.some(v=>!Number.isSafeInteger(v)||v<0)||!d.tokens||typeof d.tokens!=="object"||Array.isArray(d.tokens)||Object.values(d.tokens).some(v=>v!==null&&typeof v!=="string")||d.counts.reduce((a,b)=>a+b,0)<Object.values(d.tokens).filter(Boolean).length||(d.receipts!==undefined&&(!d.receipts||typeof d.receipts!=="object"||Array.isArray(d.receipts)||Object.values(d.receipts).some(v=>v!==true))))throw Error("Format cadangan tidak valid.");
  if(confirm("Ganti data simulasi browser ini dengan isi cadangan?")){localWrite(d);await refresh();}e.target.value="";
});
$("reset").onclick=()=>task(async()=>{if(prompt('Ketik HAPUS untuk menghapus semua suara dan undangan simulasi.')==="HAPUS"){localWrite(initialData());tickets=[];$("tickets").replaceChildren();await refresh();}});
function renderTickets(){
  $("tickets").replaceChildren();
  tickets.forEach(token=>{const card=document.createElement("div");card.className="ticket";const title=document.createElement("b");title.textContent="UNDANGAN PILKADES";const desc=document.createElement("p");desc.textContent="Desa Marengmang · 2026";const qr=qrcode(0,"M");qr.addData(token);qr.make();const img=document.createElement("img");img.src=qr.createDataURL(4,8);img.alt="QR kode undangan";const code=document.createElement("code");code.textContent=token;card.append(title,desc,img,document.createElement("br"),code);$("tickets").append(card);});
  $("ticket-note").textContent=tickets.length+" undangan dibuat. Cetak atau unduh kodenya sebelum meninggalkan halaman ini.";
}
$("generate").onclick=()=>task(async()=>{
  const n=Number($("quantity").value);if(!Number.isInteger(n)||n<1||n>200)throw Error("Jumlah harus 1–200.");
  if(typeof qrcode!=="function")throw Error("Modul pembuat QR tidak ditemukan.");
  if(tickets.length&&!confirm("Ganti tampilan undangan sebelumnya? Pastikan sudah dicetak atau diunduh."))return;
  if(ONLINE)tickets=await rpc("admin_issue",{p_count:n},accessToken);
  else {const d=localRead();tickets=Array.from({length:n},()=>"MM-"+crypto.randomUUID());tickets.forEach(t=>d.tokens[t]=null);localWrite(d);}
  renderTickets();await refresh();
});
$("print").onclick=()=>{if(!tickets.length){$("error").textContent="Buat undangan terlebih dahulu.";return;}window.print();};
$("save-tokens").onclick=()=>{if(!tickets.length){$("error").textContent="Belum ada undangan.";return;}downloadFile("kode-undangan.txt",tickets.join("\n"));};
$("open-poll").onclick=()=>task(async()=>{if(confirm("Buka pemilihan dan izinkan pengiriman suara?")){await rpc("admin_set_open",{p_open:true},accessToken);await refresh();}});
$("close-poll").onclick=()=>task(async()=>{if(confirm("Tutup pemilihan? Pengiriman suara baru akan ditolak.")){await rpc("admin_set_open",{p_open:false},accessToken);await refresh();}});
if(ONLINE)$("login-panel").hidden=false;else{$("dashboard").hidden=false;task(refresh);}
