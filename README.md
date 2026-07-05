# INTS CST 재고관리 시스템

## 설치 및 배포

### 1. Firebase 프로젝트 생성
1. https://console.firebase.google.com
2. 새 프로젝트 생성 → 이름: `ints-cst`
3. Firestore Database → 시작 (테스트 모드)
4. 프로젝트 설정 → 웹 앱 추가 → 구성값 복사

### 2. Firebase 설정 입력
`src/firebase.js` 파일에 복사한 구성값 붙여넣기

### 3. GitHub 저장소 생성
```bash
git init
git add .
git commit -m "init: CST 재고관리 앱"
git remote add origin https://github.com/kettynet81-rgb/ints-cst.git
git push -u origin main
```

### 4. Firebase Hosting 배포
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
npm run build
firebase deploy
```

### 5. 기존 데이터 적재 (선택)
```bash
npm install firebase-admin
# Firebase 콘솔 → 서비스 계정 → 키 생성 → serviceAccountKey.json 저장
node seed_data.js
```

## Firestore 인덱스
복합 인덱스 필요:
- 컬렉션: transactions
- 필드: date (내림차순), createdAt (내림차순)

## 앱 구성
- 재고 현황 대시보드: 조립가능 SET 수, KPI 카드, 부품별 재고 테이블
- 입고 입력: 품목 선택 → 수량 입력
- SET 출고: SET 수량 입력 → 차감 내역 미리보기 → 확정
- 입출고 이력: 검색/필터 가능한 전체 기록
