import { useState, useCallback, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'

// 항목명 정규화 (신형→표준)
function normalizeKey(k) {
  return String(k).trim()
    .replace('B1','B-1').replace('B2','B-2')
    .replace('D(R)','D').replace('D1','D-1').replace('D2','D-2').replace('D3','D-3')
    .replace('E-1(L)','E-1L').replace('E-2(R)','E-1R')
    .replace('F-1(L)','F-1L').replace('F-2(R)','F-1R')
}

function parseCMM(data) {
  const wb = XLSX.read(data, { type: 'array' })
  const vals = {}

  // 신형: Result 시트
  if (wb.SheetNames.includes('Result')) {
    const ws = wb.Sheets['Result']
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    for (let i = 0; i < rows.length; i++) {
      const item = String(rows[i][0] || '').trim()
      const actual = rows[i][2]
      if (item && typeof actual === 'number') {
        vals[normalizeKey(item)] = Number(actual.toFixed(4))
      }
    }
    if (Object.keys(vals).length === 0)
      throw new Error(`Result 시트에서 측정값 없음 (시트명: ${wb.SheetNames.join(', ')})`)
    return vals
  }

  // 구형: DS 행 방식
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error(`시트를 열 수 없음 (시트명: ${wb.SheetNames.join(', ')})`)
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  for (let i = 0; i < rows.length; i++) {
    const item = String(rows[i][1] || '').trim()
    const next = rows[i + 1]
    if (item && next && String(next[1]).trim() === 'DS') {
      vals[normalizeKey(item)] = Number(Number(next[2]).toFixed(4))
      i++
    }
  }
  if (Object.keys(vals).length === 0)
    throw new Error(`DS 행 없음 — 지원 형식: 구형(DS행) 또는 신형(Result시트)`)
  return vals
}

// 엑셀 컬럼 번호 → 문자 변환 (1→A, 5→E ...)
function colLetter(n) {
  let s = ''
  while (n > 0) { s = String.fromCharCode(64 + (n % 26 || 26)) + s; n = Math.floor((n-1)/26) }
  return s
}

// XML에서 셀 값 교체 (숫자형)
function patchCell(xml, cellAddr, value) {
  // 해당 셀 찾기: <c r="E8" ...> ... </c>
  const re = new RegExp(`(<c[^>]+r="${cellAddr}"[^>]*>)([\s\S]*?)(</c>)`, 'g')
  const newCell = `$1<v>${value}</v>$3`
  if (re.test(xml)) {
    return xml.replace(new RegExp(`(<c[^>]+r="${cellAddr}"[^>]*>)[\s\S]*?(</c>)`,'g'), newCell)
  }
  return xml
}

// XLSX를 JSZip으로 열어서 특정 셀만 패치 후 원본 그대로 저장
async function fillReport(templateData, cmmResults) {
  const zip = await JSZip.loadAsync(templateData)

  // workbook.xml에서 시트명→파일 매핑
  const wbXml = await zip.file('xl/workbook.xml').async('text')
  const wbRels = await zip.file('xl/_rels/workbook.xml.rels').async('text')

  // 시트명 → rId 매핑
  const sheetMap = {}
  for (const m of wbXml.matchAll(/name="([^"]+)"[^/]*r:id="(rId\d+)"/g)) {
    sheetMap[m[1]] = m[2]
  }
  // rId → 파일경로 매핑
  const relMap = {}
  for (const m of wbRels.matchAll(/Id="(rId\d+)"[^/]*Target="([^"]+)"/g)) {
    relMap[m[1]] = m[2].startsWith('worksheets') ? 'xl/'+m[2] : m[2]
  }

  const getSheetFile = (name) => {
    const rId = sheetMap[name]
    return rId ? relMap[rId] : null
  }

  const s4path = getSheetFile('4 SLIDER')
  const s2path = getSheetFile('2 CASSETTE CHECK POINT')
  const s3path = getSheetFile('3 CASSETTE CHECK POINT')

  if (!s4path) throw new Error(`'4 SLIDER' 시트 없음 (있는: ${Object.keys(sheetMap).join(', ')})`)
  if (!s2path) throw new Error(`'2 CASSETTE CHECK POINT' 시트 없음`)

  // sharedStrings 읽기 (RFID 텍스트 값 찾기)
  let sharedStrings = []
  const ssFile = zip.file('xl/sharedStrings.xml')
  if (ssFile) {
    const ssXml = await ssFile.async('text')
    sharedStrings = [...ssXml.matchAll(/<t>([^<]*)<\/t>/g)].map(m=>m[1])
  }

  // 4 SLIDER XML 분석 - RFID → 순번 매핑
  let s4xml = await zip.file(s4path).async('text')
  const rfidSeq = {}
  // 행별로 파싱
  const rowMatches = [...s4xml.matchAll(/<row[^>]+r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)]
  let hdrRow4 = -1
  for (const rm of rowMatches) {
    const rowNum = Number(rm[1])
    const rowContent = rm[2]
    // 순번 헤더 행 찾기
    if (hdrRow4 < 0 && rowContent.includes('순번')) { hdrRow4 = rowNum; continue }
    if (hdrRow4 < 0) continue
    // RFID 셀 (D열=col4) 값
    const rfidCellMatch = rowContent.match(/<c r="D\d+"[^>]*t="s"[^>]*><v>(\d+)<\/v><\/c>/)
    if (rfidCellMatch) {
      const rfid = sharedStrings[Number(rfidCellMatch[1])] || ''
      // 순번 셀 (B열=col2)
      const seqMatch = rowContent.match(/<c r="B\d+"[^>]*><v>([\d.]+)<\/v><\/c>/)
      if (rfid.startsWith('IF') && seqMatch) rfidSeq[rfid] = Number(seqMatch[1])
    }
  }
  if (hdrRow4 < 0) throw new Error("'4 SLIDER' 시트에서 '순번' 행을 찾을 수 없음")

  // 2 CASSETTE CHECK POINT 헤더 행 찾기
  let s2xml = await zip.file(s2path).async('text')
  const rowMatches2 = [...s2xml.matchAll(/<row[^>]+r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)]
  let hdrRow2 = -1
  for (const rm of rowMatches2) {
    if (rm[2].includes('순번')) { hdrRow2 = Number(rm[1]); break }
  }
  if (hdrRow2 < 0) throw new Error("'2 CASSETTE CHECK POINT' 순번 행 없음")

  // 3 CASSETTE CHECK POINT
  let s3xml = s3path ? await zip.file(s3path).async('text') : null
  let hdrRow3 = -1
  if (s3xml) {
    for (const rm of [...s3xml.matchAll(/<row[^>]+r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)]) {
      if (rm[2].includes('순번')) { hdrRow3 = Number(rm[1]); break }
    }
  }

  // 2 CASSETTE 컬럼 매핑 (E=5, F=6, G=7, H=8, I=9, J=10, K=11, L=12, M=13)
  const colMap2 = {'A':'E','B':'F','B-1':'G','B-2':'H','C':'I','D':'J','D-1':'K','D-2':'L','D-3':'M'}
  // 3 CASSETTE 컬럼 매핑 (E=5, F=6, G=7, H=8)
  const colMap3 = {'E-1L':'E','E-1R':'F','F-1L':'G','F-1R':'H'}

  // 셀 패치 함수 - 행이 없으면 새로 추가
  const setCellValue = (xml, rowNum, col, value) => {
    const addr = `${col}${rowNum}`
    // 기존 셀 교체 시도
    const cellRe = new RegExp(`(<c r="${addr}"[^>]*(?:t="[^"]*")?[^>]*>)[\s\S]*?(<\/c>)`)
    if (cellRe.test(xml)) {
      return xml.replace(cellRe, `<c r="${addr}"><v>${value}</v></c>`)
    }
    // 셀이 없으면 행 안에 추가
    const rowRe = new RegExp(`(<row[^>]+r="${rowNum}"[^>]*>)([\s\S]*?)(<\/row>)`)
    if (rowRe.test(xml)) {
      return xml.replace(rowRe, `$1$2<c r="${addr}"><v>${value}</v></c>$3`)
    }
    return xml
  }

  for (const [rfid, vals] of Object.entries(cmmResults)) {
    const seq = rfidSeq[rfid]
    if (!seq) continue

    // 2 CASSETTE: 헤더 다음 행부터 (행 하나 건너뜀 - 공차행)
    const ri2 = hdrRow2 + seq + 1
    for (const [item, col] of Object.entries(colMap2)) {
      if (vals[item] !== undefined) s2xml = setCellValue(s2xml, ri2, col, vals[item])
    }

    // 3 CASSETTE
    if (s3xml && hdrRow3 > 0) {
      const ri3 = hdrRow3 + seq + 1
      for (const [item, col] of Object.entries(colMap3)) {
        if (vals[item] !== undefined) s3xml = setCellValue(s3xml, ri3, col, vals[item])
      }
    }
  }

  zip.file(s2path, s2xml)
  if (s3xml && s3path) zip.file(s3path, s3xml)

  const out = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
  return out
}

const COLS = [
  { key:'A',    label:'A' },
  { key:'B',    label:'B' },
  { key:'B-1',  label:'B-1' },
  { key:'B-2',  label:'B-2' },
  { key:'C',    label:'C' },
  { key:'D',    label:'D' },
  { key:'D-1',  label:'D-1' },
  { key:'D-2',  label:'D-2' },
  { key:'D-3',  label:'D-3' },
  { key:'E-1L', label:'E-1(L)' },
  { key:'E-1R', label:'E-2(R)' },
  { key:'F-1L', label:'F-1(L)' },
  { key:'F-1R', label:'F-2(R)' },
]


// 엑셀 시트를 HTML 테이블로 렌더링
function SheetView({ wb, sheetName, cmmResults, rfidSeq }) {
  if (!wb || !wb.Sheets[sheetName]) return null
  const ws = wb.Sheets[sheetName]
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Z60')
  const merges = ws['!merges'] || []

  // 병합 셀 맵
  const mergeMap = {}
  const hiddenMap = {}
  merges.forEach(m => {
    mergeMap[`${m.s.r}_${m.s.c}`] = { rowSpan: m.e.r-m.s.r+1, colSpan: m.e.c-m.s.c+1 }
    for (let r=m.s.r; r<=m.e.r; r++) {
      for (let c=m.s.c; c<=m.e.c; c++) {
        if (r!==m.s.r || c!==m.s.c) hiddenMap[`${r}_${c}`] = true
      }
    }
  })

  // CMM 값 오버레이 계산
  const overlay = {}
  if (cmmResults && rfidSeq) {
    // 헤더 행 찾기
    let hdr = -1
    for (let r=range.s.r; r<=range.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({r,c:1})]
      if (cell && String(cell.v).includes('순번')) { hdr = r; break }
    }
    if (hdr >= 0) {
      const colMap = sheetName.includes('2') 
        ? { 'A':4,'B':5,'B-1':6,'B-2':7,'C':8,'D':9,'D-1':10,'D-2':11,'D-3':12 }
        : { 'E-1L':4,'E-1R':5,'F-1L':6,'F-1R':7 }
      for (const [rfid, vals] of Object.entries(cmmResults)) {
        const seq = rfidSeq[rfid]
        if (!seq) continue
        const ri = hdr + seq
        for (const [item, col] of Object.entries(colMap)) {
          if (vals[item] !== undefined) overlay[`${ri}_${col}`] = vals[item].toFixed(4)
        }
      }
    }
  }

  const rows = []
  for (let r=range.s.r; r<=range.e.r; r++) {
    const cells = []
    for (let c=range.s.c; c<=range.e.c; c++) {
      if (hiddenMap[`${r}_${c}`]) continue
      const addr = XLSX.utils.encode_cell({r,c})
      const cell = ws[addr]
      const merge = mergeMap[`${r}_${c}`]
      const ov = overlay[`${r}_${c}`]
      const val = ov !== undefined ? ov : (cell ? (cell.w || cell.v || '') : '')
      const isNum = cell?.t === 'n' || ov !== undefined
      cells.push(
        <td key={c}
          rowSpan={merge?.rowSpan||1}
          colSpan={merge?.colSpan||1}
          style={{
            border:'1px solid #d1d5db',
            padding:'2px 4px',
            fontSize:10,
            textAlign: isNum ? 'center' : 'left',
            whiteSpace:'nowrap',
            background: ov !== undefined ? '#eff6ff' : 'inherit',
            color: ov !== undefined ? '#1e40af' : 'inherit',
            fontWeight: ov !== undefined ? 700 : 'inherit',
            minWidth: 60,
          }}>
          {String(val).startsWith('=') ? '' : val}
        </td>
      )
    }
    rows.push(<tr key={r}>{cells}</tr>)
  }

  return (
    <div style={{overflow:'auto',maxHeight:400}}>
      <table style={{borderCollapse:'collapse',fontSize:10}}><tbody>{rows}</tbody></table>
    </div>
  )
}

export default function CMMReport() {
  const [template, setTemplate]     = useState(null)
  const [templateName, setTName]    = useState('')
  const [results, setResults]       = useState({}) // rfid → vals
  const [rfidOrder, setRfidOrder]   = useState([]) // 성적서 RFID 순서
  const [templateWb, setTemplateWb]  = useState(null)
  const [activeSheet, setActiveSheet] = useState('')
  const [rfidSeq, setRfidSeq]       = useState({})
  const [status, setStatus]         = useState('')
  const [watching, setWatching]     = useState(false)
  const [folderName, setFolderName] = useState('')
  const [errors, setErrors]         = useState([])
  const dirHandleRef = useRef(null)
  const intervalRef  = useRef(null)

  // 성적서 양식에서 RFID 순서 읽기
  const loadTemplate = (buf) => {
    setTemplate(buf)
    try {
      const wbObj = XLSX.read(buf, { type: 'array' })
      setTemplateWb(wbObj)
      setActiveSheet(wbObj.SheetNames[0])
      const wb = XLSX.read(buf, { type: 'array' })
      const ws4 = wb.Sheets['4 SLIDER']
      if (!ws4) return
      const rows4 = XLSX.utils.sheet_to_json(ws4, { header: 1, defval: '' })
      let hdr = -1
      for (let i = 0; i < rows4.length; i++) {
        if (String(rows4[i][1]).includes('순번')) { hdr = i; break }
      }
      if (hdr < 0) return
      const order = []
      for (let i = hdr + 1; i < rows4.length; i++) {
        const rfid = String(rows4[i][3] || '').trim()
        if (rfid.startsWith('IF')) order.push(rfid)
      }
      setRfidOrder(order)
      const seqMap = {}
      for (let i = hdr + 1; i < rows4.length; i++) {
        const rfid = String(rows4[i][3] || '').trim()
        const seq = rows4[i][1]
        if (rfid.startsWith('IF') && seq) seqMap[rfid] = Number(seq)
      }
      setRfidSeq(seqMap)
    } catch(e) {}
  }

  const onTemplate = (e) => {
    const file = e.target.files[0]; if (!file) return
    setTName(file.name)
    const reader = new FileReader()
    reader.onload = ev => loadTemplate(ev.target.result)
    reader.readAsArrayBuffer(file)
  }

  // 폴더 스캔
  const scanFolder = useCallback(async (dirHandle) => {
    const newResults = {}
    const newErrors = []
    let count = 0
    for await (const entry of dirHandle.values()) {
      if (entry.kind !== 'file') continue
      if (!entry.name.match(/\.xls[x]?$/i)) continue
      const rfid = entry.name.replace(/\.[^.]+$/, '').trim()
      try {
        const file = await entry.getFile()
        const buf = await file.arrayBuffer()
        const vals = parseCMM(new Uint8Array(buf))
        if (Object.keys(vals).length === 0) {
  // 이미 throw로 처리됨
        } else {
          newResults[rfid] = vals
          count++
        }
      } catch(e) {
        newErrors.push({msg:`${rfid}: ${e.message || '알 수 없는 오류'}`, rfid})
      }
    }
    const merged = {...results, ...newResults}
    // 성적서에 없는 RFID 경고
    if (rfidOrder.length > 0) {
      Object.keys(newResults).forEach(rfid => {
        if (!rfidOrder.includes(rfid)) newErrors.push({msg:`${rfid}: 성적서에 없는 RFID`, rfid})
      })
    }
    if (count > 0) {
      setResults(merged)
      setStatus(`${new Date().toLocaleTimeString()} — ${Object.keys(merged).length}개 RFID 읽힘`)
    }
    if (newErrors.length > 0) setErrors(prev => {
      const existMsgs = new Set(prev.map(e=>e.msg))
      return [...prev, ...newErrors.filter(e=>!existMsgs.has(e.msg))]
    })
    return count
  }, [results, rfidOrder])

  const selectFolder = async () => {
    if (!window.showDirectoryPicker) { alert('Chrome/Edge에서만 지원됩니다'); return }
    try {
      const dh = await window.showDirectoryPicker()
      dirHandleRef.current = dh
      setFolderName(dh.name)
      setResults({})
      clearInterval(intervalRef.current)
      setWatching(true)
      setStatus('폴더 감시 시작...')
      await scanFolder(dh)
      intervalRef.current = setInterval(() => scanFolder(dh), 10000)
    } catch(e) { if (e.name !== 'AbortError') alert('오류: ' + e.message) }
  }

  const stopWatch = () => { clearInterval(intervalRef.current); setWatching(false); setStatus('감시 중지') }
  useEffect(() => () => clearInterval(intervalRef.current), [])

  const download = async () => {
    if (!template) { alert('성적서 양식을 먼저 업로드해주세요'); return }
    try {
      const out = await fillReport(template, results)
      const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

      // showSaveFilePicker 지원 시 저장위치/파일명 선택
      if (window.showSaveFilePicker) {
        try {
          const fh = await window.showSaveFilePicker({
            suggestedName: templateName.replace(/\.xlsx?$/i,'') + '_완성.xlsx',
            types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }]
          })
          const writable = await fh.createWritable()
          await writable.write(blob)
          await writable.close()
          return
        } catch(e) { if (e.name === 'AbortError') return }
      }
      // 폴백
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = templateName.replace(/\.xlsx?$/i,'') + '_완성.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch(e) {
      alert('다운로드 오류: ' + e.message)
      console.error(e)
    }
  }

  const displayList = rfidOrder.length > 0 ? rfidOrder : Object.keys(results).sort()
  const doneCount = displayList.filter(r => results[r]).length

  return (
    <div style={{padding:16,display:'flex',flexDirection:'column',gap:12}}>
      {/* 헤더 */}
      <div style={{background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',padding:'12px 18px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10}}>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:'#111827'}}>📐 CMM 성적서</div>
          {doneCount > 0 && <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>{doneCount} / {displayList.length || '?'}개 완료</div>}
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {/* 양식 업로드 */}
          <label style={{padding:'6px 14px',background:template?'#16a34a':'#374151',color:'#fff',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700}}>
            {template?'✓ 양식 변경':'📂 성적서 양식 업로드'}
            <input type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={onTemplate}/>
          </label>
          {/* 폴더 감시 */}
          {!watching
            ? <button onClick={selectFolder}
                style={{padding:'6px 14px',background:'#7c3aed',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700}}>
                📁 측정결과 폴더 선택
              </button>
            : <button onClick={stopWatch}
                style={{padding:'6px 14px',background:'#dc2626',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700}}>
                ⏹ 감시 중지
              </button>
          }
          {watching && (
            <span style={{fontSize:11,color:'#16a34a',fontWeight:600,display:'flex',alignItems:'center',gap:5}}>
              <span style={{
                width:8,height:8,borderRadius:'50%',background:'#16a34a',display:'inline-block',
                animation:'pulse 1.2s ease-in-out infinite'
              }}/>
              실시간 감시 중
            </span>
          )}
          <style>{`
            @keyframes pulse {
              0%,100%{opacity:1;transform:scale(1)}
              50%{opacity:0.3;transform:scale(0.8)}
            }
          `}</style>
          {/* 다운로드 */}
          <button onClick={download} disabled={!template||doneCount===0}
            style={{padding:'6px 14px',background:template&&doneCount>0?'#1e40af':'#d1d5db',color:'#fff',border:'none',borderRadius:6,
              cursor:template&&doneCount>0?'pointer':'not-allowed',fontSize:12,fontWeight:700}}>
            ⬇ 다운로드
          </button>
        </div>
        {/* 선택 정보 표시 */}
        <div style={{display:'flex',gap:16,marginTop:8,flexWrap:'wrap'}}>
          {templateName && <span style={{fontSize:12,color:'#374151'}}>📋 성적서: <strong>{templateName}</strong></span>}
          {folderName && <span style={{fontSize:12,color:'#374151'}}>📁 측정결과 폴더: <strong>{folderName}</strong></span>}
        </div>
      </div>

      {status && <div style={{fontSize:11,color:'#6b7280',paddingLeft:4}}>{status}</div>}
      {errors.length > 0 && (
        <div style={{background:'#fff5f5',border:'1px solid #fca5a5',borderRadius:8,padding:'10px 14px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <span style={{fontWeight:700,fontSize:12,color:'#dc2626'}}>⚠ 오류 {errors.length}건</span>
            <button onClick={()=>setErrors([])}
              style={{fontSize:11,color:'#9ca3af',background:'none',border:'none',cursor:'pointer',padding:'2px 6px'}}>
              전체 닫기
            </button>
          </div>
          {errors.map((err,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 0',borderBottom:i<errors.length-1?'1px solid #fee2e2':'none'}}>
              <span style={{fontSize:11,color:'#dc2626',flex:1}}>• {err.msg}</span>
              {err.rfid && results[err.rfid] && (
                <button onClick={()=>{ setResults(p=>{const n={...p};delete n[err.rfid];return n}); setErrors(p=>p.filter((_,j)=>j!==i)) }}
                  style={{fontSize:10,padding:'2px 6px',background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:4,cursor:'pointer',color:'#dc2626',whiteSpace:'nowrap'}}>
                  데이터 삭제
                </button>
              )}
              <button onClick={()=>setErrors(p=>p.filter((_,j)=>j!==i))}
                style={{fontSize:10,padding:'2px 6px',background:'#f3f4f6',border:'1px solid #e5e7eb',borderRadius:4,cursor:'pointer',color:'#6b7280'}}>
                닫기
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 성적서 테이블 */}
      {/* 시트 뷰 탭 */}
      {templateWb && (
        <div style={{background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',overflow:'hidden'}}>
          <div style={{display:'flex',gap:0,borderBottom:'1px solid #e5e7eb',background:'#f8fafc',overflowX:'auto'}}>
            {templateWb.SheetNames.map(s=>(
              <button key={s} onClick={()=>setActiveSheet(s)}
                style={{padding:'8px 14px',border:'none',cursor:'pointer',fontSize:11,fontFamily:'inherit',
                  background:activeSheet===s?'#fff':'transparent',
                  fontWeight:activeSheet===s?700:400,
                  borderBottom:activeSheet===s?'2px solid #1e40af':'none',
                  color:activeSheet===s?'#1e40af':'#6b7280'}}>
                {s}
              </button>
            ))}
          </div>
          <SheetView wb={templateWb} sheetName={activeSheet} cmmResults={results} rfidSeq={rfidSeq}/>
        </div>
      )}

      {displayList.length > 0 && (
        <div style={{background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',overflow:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,tableLayout:'fixed',minWidth:900}}>
            <colgroup>
              <col style={{width:40}}/><col style={{width:90}}/>
              {COLS.map(c=><col key={c.key} style={{width:62}}/>)}
              <col style={{width:50}}/>
            </colgroup>
            <thead>
              <tr style={{background:'#1e293b',color:'#e2e8f0'}}>
                <th style={S.th}>NO</th>
                <th style={S.th}>RFID</th>
                {COLS.map(c=><th key={c.key} style={S.th}>{c.label}</th>)}
                <th style={S.th}>상태</th>
              </tr>
            </thead>
            <tbody>
              {displayList.map((rfid, i) => {
                const vals = results[rfid]
                return (
                  <tr key={rfid} style={{background:vals?i%2===0?'#f8fafc':'#fff':'#fffbeb'}}>
                    <td style={{...S.td,textAlign:'center',color:'#9ca3af'}}>{i+1}</td>
                    <td style={{...S.td,fontWeight:700,color:'#1e40af'}}>{rfid}</td>
                    {COLS.map(c=>(
                      <td key={c.key} style={{...S.td,textAlign:'center',color:vals?'#111827':'#d1d5db'}}>
                        {vals ? vals[c.key]?.toFixed(4) ?? '-' : '—'}
                      </td>
                    ))}
                    <td style={{...S.td,textAlign:'center'}}>
                      {vals
                        ? <span style={{color:'#16a34a',fontWeight:700}}>✓</span>
                        : <span style={{color:'#d1d5db'}}>-</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {displayList.length === 0 && (
        <div style={{background:'#fff',borderRadius:10,border:'2px dashed #e5e7eb',padding:60,textAlign:'center',color:'#9ca3af'}}>
          <div style={{fontSize:32,marginBottom:8}}>📐</div>
          <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>성적서 양식을 업로드하면 RFID 목록이 표시됩니다</div>
          <div style={{fontSize:12}}>폴더 선택 후 CMM 측정값이 실시간으로 채워져요</div>
        </div>
      )}
    </div>
  )
}

const S = {
  th: { padding:'6px 4px', fontWeight:600, fontSize:11, textAlign:'center', whiteSpace:'nowrap', borderRight:'1px solid #334155' },
  td: { padding:'5px 4px', borderBottom:'1px solid #f1f5f9', borderRight:'1px solid #f1f5f9', fontSize:11 }
}
