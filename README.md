# Capstone WebView

Android 앱의 분석 결과 화면에서 여는 React + Vite WebView 서버입니다.

최종 접속 경로:

```text
http://EC2_PUBLIC_IP:3000/webview
```

앱 설정:

```text
BASE_URL = http://EC2_PUBLIC_IP:8000/
REACT_SERVER_URL = http://EC2_PUBLIC_IP:3000
```

## 기능

- `/webview` 경로로 접속해도 React SPA가 열립니다.
- Android WebView에서 전달하는 `window.postMessage({ type: 'ANALYSIS_DATA', payload: [parsed] }, '*')` 데이터를 받습니다.
- `window.AndroidBridge.webViewReady()`가 있으면 WebView 준비 후 호출합니다.
- 분석 결과 제목, 코드, 주제, 해설, 지문, 문장별 구문 분석, 청크, vocabulary, generated_questions, 원본 JSON을 표시합니다.
- 데이터가 아직 없으면 `앱에서 분석 데이터를 기다리는 중입니다.` 문구를 표시합니다.

## 로컬 실행

```bash
cd webview
npm install
npm run dev
```

브라우저에서 접속합니다.

```text
http://localhost:3000/webview
```

로컬 브라우저에서 테스트 데이터를 넣고 싶으면 개발자 도구 콘솔에서 실행합니다.

```js
window.postMessage({
  type: 'ANALYSIS_DATA',
  payload: [{
    code: 'SAMPLE-001',
    topic: '구문 분석 테스트',
    commentary: '샘플 해설입니다.',
    passage: 'This is a sample passage.',
    analysis_data: {
      sentences: [
        {
          sentence: 'This is a sample passage.',
          chunks: [
            {
              target_text: 'This',
              korean_meaning: '이것',
              syntax_tag: 'Subject',
              grammar_note: '문장의 주어입니다.'
            }
          ]
        }
      ]
    },
    vocabulary: [
      { word: 'sample', meaning: '예시' }
    ],
    generated_questions: [
      { question: 'What is this?', answer: 'A sample passage.' }
    ]
  }]
}, '*');
```

## Docker 실행

```bash
cd webview
docker build -t capstone-webview .
docker run -d --name capstone-webview -p 3000:80 capstone-webview
```

접속:

```text
http://localhost:3000/webview
```

## EC2 배포

EC2의 백엔드 저장소 안에 `webview` 폴더가 있다고 가정합니다.

```bash
cd ~/capstone-server/backend
git pull
docker compose up -d --build webview
```

EC2 보안 그룹에서 TCP 3000번 인바운드가 열려 있어야 합니다.

## docker-compose.yml 서비스 예시

```yaml
webview:
  build:
    context: ./webview
  container_name: capstone-webview
  restart: unless-stopped
  ports:
    - "3000:80"
  networks:
    - capstone-net
```

기존 `backend`, `postgres` 서비스와 같은 `capstone-net` 네트워크를 사용하면 됩니다.
