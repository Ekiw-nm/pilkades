/* Export XLSX asli (Office Open XML), tanpa koneksi internet atau dependensi eksternal. */
(function(root){
  'use strict';
  const enc=new TextEncoder();
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  function crc(bytes){let n=0xffffffff;for(const b of bytes)n=table[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
  function zip(files){
    const local=[],central=[];let offset=0;
    const header=n=>{const b=new Uint8Array(n);return [b,new DataView(b.buffer)];};
    for(const [name,xml] of Object.entries(files)){
      const path=enc.encode(name),bytes=enc.encode(xml),check=crc(bytes);
      const [lh,l]=header(30);l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(12,33,true);l.setUint32(14,check,true);l.setUint32(18,bytes.length,true);l.setUint32(22,bytes.length,true);l.setUint16(26,path.length,true);
      local.push(lh,path,bytes);
      const [ch,c]=header(46);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);c.setUint32(16,check,true);c.setUint32(20,bytes.length,true);c.setUint32(24,bytes.length,true);c.setUint16(28,path.length,true);c.setUint32(42,offset,true);
      central.push(ch,path);offset+=lh.length+path.length+bytes.length;
    }
    const size=central.reduce((n,b)=>n+b.length,0),[end,e]=header(22),count=Object.keys(files).length;
    e.setUint32(0,0x06054b50,true);e.setUint16(8,count,true);e.setUint16(10,count,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
    const output=new Uint8Array(offset+size+22);let at=0;for(const b of [...local,...central,end]){output.set(b,at);at+=b.length;}return output;
  }
  function build(candidates,stats,online,now=new Date()){
    if(candidates.length!==4||!Array.isArray(stats.counts)||stats.counts.length!==4||stats.counts.some(x=>!Number.isSafeInteger(x)||x<0))throw Error('Data rekap tidak valid.');
    const total=stats.counts.reduce((a,b)=>a+b,0);if(!Number.isSafeInteger(total))throw Error('Total suara terlalu besar.');
    const t=(ref,value,style=0)=>'<c r="'+ref+'" s="'+style+'" t="inlineStr"><is><t xml:space="preserve">'+escape(value)+'</t></is></c>';
    const n=(ref,value,style=3,formula='')=>'<c r="'+ref+'" s="'+style+'">'+(formula?'<f>'+escape(formula)+'</f>':'')+'<v>'+value+'</v></c>';
    const row=(r,cells,height=23)=>'<row r="'+r+'" ht="'+height+'" customHeight="1">'+cells+'</row>';
    const stamp=now.toLocaleString('id-ID',{timeZone:'Asia/Jakarta'});
    let rows=row(1,t('A1','REKAP PEMILIHAN KEPALA DESA MARENGMANG',1),32)+row(2,t('A2',(online?'DATABASE ONLINE':'SIMULASI LOKAL')+' - TAHUN 2026',5))+row(3,t('A3','Diekspor: '+stamp+' WIB',5));
    rows+=row(5,['Nomor Urut','Nama Calon','Jumlah Suara','Persentase'].map((v,i)=>t('ABCD'[i]+'5',v,2)).join(''),27);
    candidates.forEach((c,i)=>{const r=6+i;rows+=row(r,n('A'+r,c.id)+t('B'+r,c.name)+n('C'+r,stats.counts[i])+n('D'+r,total?stats.counts[i]/total:0,4,'IF($C$10=0,0,C'+r+'/$C$10)'));});
    rows+=row(10,t('A10','TOTAL',6)+n('C10',total,6,'SUM(C6:C9)')+n('D10',total?1:0,7,'IF(C10=0,0,SUM(D6:D9))'),27);
    rows+=row(12,t('A12','Jumlah undangan',5)+n('C12',stats.issued));
    rows+=row(13,t('A13',online?'Undangan digunakan':'Kode pernah dipakai',5)+n('C13',stats.used));
    rows+=row(15,t('A15',online?'Status pemilihan: '+(stats.open?'DIBUKA':'DITUTUP'):'Simulasi: satu QR dapat dipakai berulang; total suara menghitung sesi latihan.',5),28);
    const declaration='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const files={
      '[Content_Types].xml':declaration+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels':declaration+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':declaration+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Rekap Suara" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
      'xl/_rels/workbook.xml.rels':declaration+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml':declaration+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FFAD1C2B"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFAD1C2B"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4F5EF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="3" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/><xf numFmtId="164" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
      'xl/worksheets/sheet1.xml':declaration+'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D15"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="23"/><cols><col min="1" max="1" width="16" customWidth="1"/><col min="2" max="2" width="32" customWidth="1"/><col min="3" max="4" width="19" customWidth="1"/></cols><sheetData>'+rows+'</sheetData><autoFilter ref="A5:D9"/><mergeCells count="7"><mergeCell ref="A1:D1"/><mergeCell ref="A2:D2"/><mergeCell ref="A3:D3"/><mergeCell ref="A10:B10"/><mergeCell ref="A12:B12"/><mergeCell ref="A13:B13"/><mergeCell ref="A15:D15"/></mergeCells><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape"/></worksheet>'
    };
    return zip(files);
  }
  root.PilkadesXlsx={build};
})(typeof window!=='undefined'?window:globalThis);
