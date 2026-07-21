import { useState, useCallback } from 'react'
import * as XLSX from 'xlsx'

function parseRfid(text) {
  const map = {}
  for (const line of text.split(/\n/)) {
    for (const m of line.matchAll(/(\d+)\s+([A-Z][A-Z0-9]{3,})/g)) {
      const no = parseInt(m[1])
      const rfid = m[2].trim()
      if (rfid !== 'RFID' && no > 0) map[no] = rfid
    }
  }
  return Object.keys(map).map(Number).sort((a, b) => a - b).map(no => ({ no, rfid: map[no] }))
}

export default function CertConverter({ isMobile }) {
  const [inputText, setInputText] = useState('')
  const [rfidList, setRfidList]   = useState([])
  const [parsed, setParsed]       = useState(false)
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)

  const handleParse = useCallback(() => {
    setError('')
    if (!inputText.trim()) { setError('RFID 데이터를 붙여넣어 주세요.'); return }
    const list = parseRfid(inputText)
    if (list.length === 0) { setError('RFID 코드를 인식하지 못했습니다. 형식을 확인해 주세요.'); return }
    setRfidList(list)
    setParsed(true)
  }, [inputText])

  const handleDownload = useCallback(async () => {
    if (!rfidList.length) return
    setLoading(true)
    try {
      // 원본 템플릿 로드 (서식/필터/열너비 모두 보존)
      const res = await fetch('/cert-template.xlsx')
      const buf = await res.arrayBuffer()
      const wb  = XLSX.read(buf, { type: 'array', cellStyles: true })
      const ws  = wb.Sheets[wb.SheetNames[0]]

      const ROWS_PER_LOT = 42
      rfidList.forEach(({ rfid }, i) => {
        const startRow = i * ROWS_PER_LOT + 2 // 헤더가 1행
        for (let r = startRow; r < startRow + ROWS_PER_LOT; r++) {
          // E열 (Lot No), F열 (Comments)
          ws[`E${r}`] = { t: 's', v: rfid }
          ws[`F${r}`] = { t: 's', v: rfid }
        }
      })

      XLSX.writeFile(wb, 'INTS-원자재_협력업체_데이터.xlsx')
    } catch (e) {
      setError('파일 생성 중 오류가 발생했습니다: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [rfidList])

  const handleReset = () => { setInputText(''); setRfidList([]); setParsed(false); setError('') }

  const S = {
    wrap:     { padding: isMobile ? '16px 12px' : '24px 32px', maxWidth: 800, fontFamily: 'inherit' },
    title:    { fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 4 },
    sub:      { fontSize: 12, color: '#64748b', marginBottom: 20 },
    infoBox:  { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#475569' },
    textarea: { width: '100%', height: 220, border: '1px solid #cbd5e1', borderRadius: 6, padding: 10, fontSize: 12, fontFamily: 'monospace', resize: 'vertical', outline: 'none', boxSizing: 'border-box' },
    err:      { marginTop: 8, color: '#dc2626', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 4, padding: '6px 12px', background: '#fef2f2' },
    btnRow:   { display: 'flex', gap: 10, marginTop: 12 },
    btnPri:   { padding: '9px 24px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 },
    btnSec:   { padding: '9px 16px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
    btnDl:    { padding: '11px 32px', background: loading ? '#6b7280' : '#1e40af', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 700 },
    resHdr:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    tblWrap:  { maxHeight: 260, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 4, marginBottom: 14 },
  }

  return (
    <div style={S.wrap}>
      <div style={S.title}>CST성적서 데이터 변환</div>
      <div style={S.sub}>RFID 표를 붙여넣으면 원본 서식 그대로 E·F열(Lot No)이 채워진 Excel을 생성합니다.</div>

      {!parsed ? (
        <>
          <div style={S.infoBox}>
            <b style={{ display: 'block', marginBottom: 4 }}>입력 형식 예시</b>
            <code style={{ fontSize: 11, whiteSpace: 'pre', display: 'block', lineHeight: 1.6 }}>
              {'No.\tRFID\t\tNo.\tRFID\n1\tIFZG439\t29\tIFZG467\n2\tIFZG440\t30\tIFZG468'}
            </code>
            <span style={{ display: 'block', marginTop: 6 }}>→ 엑셀/메모장에서 복사해 아래에 붙여넣으세요.</span>
          </div>

          <textarea
            value={inputText}
            onChange={e => { setInputText(e.target.value); setError('') }}
            placeholder="RFID 표 데이터를 여기에 붙여넣으세요..."
            style={S.textarea}
          />

          {error && <div style={S.err}>{error}</div>}

          <div style={S.btnRow}>
            <button style={S.btnPri} onClick={handleParse}>RFID 파싱</button>
            <button style={S.btnSec} onClick={handleReset}>초기화</button>
          </div>
        </>
      ) : (
        <>
          <div style={S.infoBox}>
            <div style={S.resHdr}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                파싱 결과 — 총 {rfidList.length}EA · {rfidList.length * 42}행 생성
              </span>
              <button style={{ ...S.btnSec, padding: '4px 12px', fontSize: 12 }} onClick={handleReset}>
                다시 입력
              </button>
            </div>
            <div style={S.tblWrap}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', position: 'sticky', top: 0 }}>
                    {['No.', 'RFID', '행 범위'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 700, color: '#374151' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rfidList.map(({ no, rfid }, i) => (
                    <tr key={no} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                      <td style={{ padding: '4px 10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{no}</td>
                      <td style={{ padding: '4px 10px', border: '1px solid #e2e8f0', fontFamily: 'monospace' }}>{rfid}</td>
                      <td style={{ padding: '4px 10px', border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b' }}>
                        {i * 42 + 2} ~ {(i + 1) * 42 + 1}행
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ ...S.infoBox, marginBottom: 16 }}>
            <b>생성 규칙</b><br />
            • 원본 템플릿 서식 유지 (Calibri 11pt, 열 너비, 헤더 색상, 필터)<br />
            • 각 RFID → 42개 검사항목 행 (E열·F열 Lot No 삽입)<br />
            • 시트명: <code>원자재 협력업체 데이터</code>
          </div>

          {error && <div style={{ ...S.err, marginBottom: 12 }}>{error}</div>}

          <button style={S.btnDl} onClick={handleDownload} disabled={loading}>
            {loading ? '⏳ 생성 중...' : '↓ Excel 다운로드'}
          </button>
        </>
      )}
    </div>
  )
}
