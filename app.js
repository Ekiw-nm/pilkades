"use strict";
const $=id=>document.getElementById(id);
let token="",selected=null,receipt="",scanner=null,scanning=false,busy=false,submitted=false;
let receiptDraft=null,receiptTimer=null;
let cameraSession=0,cameraStarting=false,fileScanner=null,lastScan="",lastScanAt=0;
$("mode").textContent=ONLINE?"DATABASE ONLINE":"SIMULASI LOKAL";
$("demo-tip").hidden=ONLINE;
function screen(name){
  ["checkin","ballot","success"].forEach(id=>$(id).hidden=id!==name);
  $("step1").classList.toggle("active",name==="checkin");
  $("step2").classList.toggle("active",name==="ballot");
  $("step3").classList.toggle("active",name==="success");
  window.scrollTo(0,0);
}
function choose(id){
  if(busy)return;selected=id;
  [...$("candidates").children].forEach((el,i)=>el.setAttribute("aria-pressed",String(i+1===id)));
  $("selection").textContent="Pilihan Anda: nomor "+id+" · "+CANDIDATES[id-1].name;
  $("review").disabled=false;
}
CANDIDATES.forEach(c=>{const el=candidateCard(c);el.onclick=()=>choose(c.id);$("candidates").append(el);});
async function stopScanner(){
  cameraSession++;scanning=false;
  if($("camera-view").open)$("camera-view").close();
  if(scanner?.isScanning){try{await scanner.stop();}catch{}}
  $("camera").textContent="Aktifkan kamera";$("scan-placeholder").hidden=false;
  $("camera-error").textContent="";
}
async function enter(value,session=null){
  if(busy)return;busy=true;$("entry-error").textContent="";$("token-form").querySelector("button").disabled=true;
  try{
    const normalized=normalizeToken(value);await validateToken(normalized);
    if(session!==null && session!==cameraSession)return;
    token=normalized;selected=null;receipt=crypto.randomUUID();submitted=false;
    $("review").disabled=true;$("selection").textContent="Belum ada calon yang dipilih";
    [...$("candidates").children].forEach(el=>el.setAttribute("aria-pressed","false"));
    await stopScanner();$("token").value="";screen("ballot");
  }catch(e){if(session===null||session===cameraSession){$("entry-error").textContent=e.message;if($("camera-view").open){$("camera-error").textContent=e.message;$("camera-status").textContent="Silakan pindai QR undangan yang valid.";}}}
  finally{busy=false;$("token-form").querySelector("button").disabled=false;}
}
$("token-form").onsubmit=e=>{e.preventDefault();enter($("token").value);};
$("camera").onclick=async()=>{
  if(cameraStarting||busy)return;
  if(scanning){await stopScanner();return;}
  const session=++cameraSession;
  try{
    if(!window.Html5Qrcode)throw Error("Pemindai QR belum tersedia. Gunakan kode undangan.");
    if(!window.isSecureContext)throw Error("Kamera membutuhkan HTTPS atau localhost. Buka http://localhost/pilkades/ pada PC XAMPP, atau alamat HTTPS Netlify pada HP/tablet.");
    cameraStarting=true;$("camera").disabled=true;
    $("entry-error").textContent="";$("camera-error").textContent="";
    $("camera-status").textContent="Izinkan akses kamera jika browser meminta izin…";
    $("camera-view").showModal();$("close-camera").focus();
    scanner ||= new Html5Qrcode("reader");
    lastScan="";lastScanAt=0;
    await scanner.start({facingMode:"environment"},{fps:8},text=>{
      if(session!==cameraSession||busy)return;
      const now=Date.now();if(text===lastScan&&now-lastScanAt<2000)return;
      lastScan=text;lastScanAt=now;
      $("camera-status").textContent="QR terbaca. Memeriksa kode undangan…";$("camera-error").textContent="";
      enter(text,session);
    },()=>{});
    if(session!==cameraSession){if(scanner.isScanning)await scanner.stop();return;}
    scanning=true;$("camera-status").textContent="Arahkan QR undangan ke kamera.";
  }catch(e){
    if(session===cameraSession){await stopScanner();$("entry-error").textContent="Kamera tidak dapat dibuka. "+(e.message||String(e))+" Izinkan kamera atau gunakan unggah QR / input kode.";}
  }finally{cameraStarting=false;$("camera").disabled=false;}
};
$("close-camera").onclick=()=>stopScanner();
$("camera-view").addEventListener("cancel",e=>{e.preventDefault();stopScanner();});
$("qr-file").onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try {await stopScanner();fileScanner ||= new Html5Qrcode("file-reader");const value=await fileScanner.scanFile(file,false);await enter(value);}
  catch{$("entry-error").textContent="Kode QR tidak terbaca. Gunakan gambar yang jelas atau masukkan kode manual.";}
  finally{e.target.value="";}
};
$("review").onclick=()=>{
  if(!selected||busy)return;$("chosen").replaceChildren(candidateCard(CANDIDATES[selected-1],false));
  $("vote-error").textContent="";$("confirmation").showModal();$("step3").classList.add("active");$("repeat").focus();
};
$("repeat").onclick=()=>{if(busy||submitted)return;$("confirmation").close();$("step3").classList.remove("active");};
$("confirmation").addEventListener("cancel",e=>{if(busy||submitted)e.preventDefault();else $("step3").classList.remove("active");});
$("submit-vote").onclick=async()=>{
  if(busy||!selected)return;busy=true;submitted=true;$("submit-vote").disabled=true;$("repeat").disabled=true;
  $("submit-vote").textContent="MENYIMPAN…";$("vote-error").textContent="";
  try{
    receiptDraft ||= makeReceipt(selected,receipt);
    await castVote(token,selected,receipt);
    $("confirmation").close();$("success-text").textContent=ONLINE?"Suara berhasil dikirim dan tersimpan di database.":"Suara simulasi berhasil tersimpan di browser ini.";
    token="";selected=null;screen("success");showReceipt(receiptDraft);
  }catch(e){
    $("vote-error").textContent=e.message+" Jika koneksi terputus, tekan COBA KIRIM LAGI. Pilihan dikunci sampai pengiriman dipastikan.";
  }finally{
    busy=false;$("submit-vote").disabled=false;$("submit-vote").textContent=$("success").hidden?"COBA KIRIM LAGI":"PILIH";
  }
};
function reset(){
  clearTimeout(receiptTimer);receiptDraft=null;$("receipt-printer").classList.remove("printing");$("receipt-qr").removeAttribute("src");$("receipt-id").textContent="";$("receipt-time").textContent="";$("print-receipt").disabled=true;
  token="";selected=null;submitted=false;$("repeat").disabled=false;$("submit-vote").textContent="PILIH";$("entry-error").textContent="";screen("checkin");
}
function makeReceipt(candidate,id){
  if(typeof qrcode!=="function")throw Error("Modul QR belum dimuat. Muat ulang halaman sebelum melanjutkan.");
  const chosen=CANDIDATES.find(c=>c.id===candidate);
  const created=new Date().toISOString();
  const payload={jenis:"BUKTI_SIMULASI_PILKADES",versi:1,desa:"Marengmang",tahun:2026,id,nomor:chosen.id,kandidat:chosen.name,waktu:created};
  const qr=qrcode(0,"M");qr.addData(JSON.stringify(payload));qr.make();
  return {image:qr.createDataURL(5,20),id,created};
}
function showReceipt(data){
  clearTimeout(receiptTimer);
  $("receipt-qr").src=data.image;$("receipt-id").textContent="ID: "+data.id;
  $("receipt-time").textContent=new Date(data.created).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})+" WIB";
  $("receipt-printer").classList.remove("printing");
  void $("receipt-printer").offsetWidth;
  $("receipt-printer").classList.add("printing");
  $("print-status").textContent="Simulasi: printer sedang mengeluarkan bukti QR…";
  $("print-receipt").disabled=false;
  receiptTimer=setTimeout(()=>{$("print-status").textContent="Bukti QR siap. Cetak dan masukkan kertasnya ke kotak suara.";},2600);
}
$("print-receipt").onclick=()=>{if(receiptDraft&&!$("success").hidden)window.print();};
$("next").onclick=reset;
$("fullscreen").onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}};
const linkCode=new URLSearchParams(location.hash.slice(1)).get("kode");
if(linkCode){$("token").value=linkCode;history.replaceState(null,"",location.pathname+location.search);}
