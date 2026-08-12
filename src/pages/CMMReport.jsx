import { useState } from 'react'

export default function CMMReport() {
  const [cmmFile, setCmmFile] = useState(null)

  return (
    <div style={{padding:24,display:'flex',flexDirection:'column',gap:16}}>
      <div style={{background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',padding:'16px 20px'}}>
        <div style={{fontSize:18,fontWeight:700,color:'#111827',marginBottom:4}}>📐 CMM 성적서 자동 생성</div>
        <div style={{fontSize:12,color:'#6b7280'}}>3차원 측정기 데이터 → 성적서 양식 자동 변환</div>
      </div>
      <div style={{background:'#fff',borderRadius:10,border:'2px dashed #d1d5db',padding:40,textAlign:'center'}}>
        <div style={{fontSize:32,marginBottom:12}}>📂</div>
        <div style={{fontSize:14,fontWeight:600,color:'#374151',marginBottom:8}}>측정기 엑셀 업로드</div>
        <div style={{fontSize:12,color:'#9ca3af',marginBottom:16}}>CMM 측정 데이터 파일 (.xlsx, .xls)</div>
        <label style={{padding:'8px 20px',background:'#1e40af',color:'#fff',borderRadius:6,cursor:'pointer',fontSize:13,fontWeight:700}}>
          파일 선택
          <input type="file" accept=".xlsx,.xls" style={{display:'none'}}
            onChange={e=>{ if(e.target.files[0]) setCmmFile(e.target.files[0]) }}/>
        </label>
        {cmmFile && <div style={{marginTop:12,fontSize:12,color:'#1e40af',fontWeight:600}}>✓ {cmmFile.name}</div>}
      </div>
      <div style={{background:'#f8fafc',borderRadius:10,border:'1px solid #e5e7eb',padding:20,textAlign:'center',color:'#9ca3af',fontSize:13}}>
        ⚙️ 측정기 엑셀 양식 분석 후 자동 매핑 기능 구현 예정
      </div>
    </div>
  )
}
