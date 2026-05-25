import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const MESSAGE_TYPE = 'ANALYSIS_DATA';

function parseMessageData(data) {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  return data && typeof data === 'object' ? data : null;
}

function normalizePayload(message) {
  if (!message || message.type !== MESSAGE_TYPE) {
    return null;
  }

  if (Array.isArray(message.payload)) {
    return message.payload[0] ?? null;
  }

  return message.payload ?? null;
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return Object.values(value);
  return [value];
}

function firstArray(...values) {
  for (const value of values) {
    const list = asArray(value);
    if (list.length > 0) return list;
  }

  return [];
}

function getAnalysisRoot(data) {
  return data?.analysis_data ?? data?.analysisData ?? data?.analysis ?? {};
}

function getSentences(data) {
  const root = getAnalysisRoot(data);

  return firstArray(
    data?.syntax_analysis_sentences,
    data?.sentences,
    root?.syntax_analysis_sentences,
    root?.sentences,
    root?.sentence_analysis,
    root?.sentenceAnalysis,
    root?.syntax_analysis?.sentences
  );
}

function getSentenceChunks(sentence) {
  return firstArray(
    sentence?.chunks,
    sentence?.syntax_analysis_chunks,
    sentence?.syntax_chunks
  );
}

function getAllChunks(data) {
  const root = getAnalysisRoot(data);

  return firstArray(
    data?.syntax_analysis_chunks,
    data?.chunks,
    root?.syntax_analysis_chunks,
    root?.chunks,
    root?.syntax_analysis?.chunks
  );
}

function getVocabulary(data) {
  const root = getAnalysisRoot(data);

  return firstArray(
    data?.vocabulary,
    data?.vocabularies,
    root?.vocabulary,
    root?.vocabularies
  );
}

function getQuestions(data) {
  const root = getAnalysisRoot(data);

  return firstArray(
    data?.generated_questions,
    data?.questions,
    root?.generated_questions,
    root?.questions
  );
}

function renderValue(value, fallback = '-') {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function Field({ label, value }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className="field-value">{renderValue(value)}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ChunkCard({ chunk, index }) {
  return (
    <article className="chunk-card">
      <div className="chunk-index">Chunk {index + 1}</div>
      <Field label="target_text" value={chunk?.target_text ?? chunk?.targetText ?? chunk?.text} />
      <Field label="korean_meaning" value={chunk?.korean_meaning ?? chunk?.koreanMeaning ?? chunk?.meaning} />
      <Field label="syntax_tag" value={chunk?.syntax_tag ?? chunk?.syntaxTag ?? chunk?.tag} />
      <Field label="grammar_note" value={chunk?.grammar_note ?? chunk?.grammarNote ?? chunk?.note} />
    </article>
  );
}

function SentenceAnalysis({ data }) {
  const sentences = getSentences(data);
  const rootChunks = getAllChunks(data);

  if (sentences.length === 0 && rootChunks.length === 0) {
    return <p className="empty-small">문장별 구문 분석 데이터가 없습니다.</p>;
  }

  if (sentences.length === 0) {
    return (
      <div className="chunk-grid">
        {rootChunks.map((chunk, index) => (
          <ChunkCard key={index} chunk={chunk} index={index} />
        ))}
      </div>
    );
  }

  return (
    <div className="sentence-list">
      {sentences.map((sentence, sentenceIndex) => {
        const chunks = getSentenceChunks(sentence);

        return (
          <article className="sentence-card" key={sentenceIndex}>
            <div className="sentence-title">Sentence {sentenceIndex + 1}</div>
            <p className="sentence-text">
              {renderValue(sentence?.sentence ?? sentence?.text ?? sentence?.target_text ?? sentence)}
            </p>
            {chunks.length > 0 && (
              <div className="chunk-grid">
                {chunks.map((chunk, chunkIndex) => (
                  <ChunkCard key={chunkIndex} chunk={chunk} index={chunkIndex} />
                ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function VocabularyList({ items }) {
  if (items.length === 0) {
    return <p className="empty-small">vocabulary 데이터가 없습니다.</p>;
  }

  return (
    <div className="list">
      {items.map((item, index) => (
        <article className="list-item" key={index}>
          <strong>{renderValue(item?.word ?? item?.target_text ?? item?.term ?? `Item ${index + 1}`)}</strong>
          <span>{renderValue(item?.meaning ?? item?.korean_meaning ?? item?.definition ?? item)}</span>
        </article>
      ))}
    </div>
  );
}

function QuestionList({ items }) {
  if (items.length === 0) {
    return <p className="empty-small">generated_questions 데이터가 없습니다.</p>;
  }

  return (
    <div className="list">
      {items.map((item, index) => (
        <article className="question-card" key={index}>
          <div className="question-title">Q{index + 1}</div>
          <p>{renderValue(item?.question ?? item?.prompt ?? item)}</p>
          {item?.options && <Field label="options" value={item.options} />}
          {item?.answer && <Field label="answer" value={item.answer} />}
          {item?.explanation && <Field label="explanation" value={item.explanation} />}
        </article>
      ))}
    </div>
  );
}

function App() {
  const [analysisData, setAnalysisData] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  useEffect(() => {
    const handleMessage = (event) => {
      const message = parseMessageData(event.data);
      const payload = normalizePayload(message);

      if (payload) {
        setAnalysisData(payload);
        setLastUpdatedAt(new Date());
      }
    };

    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage);

    if (window.AndroidBridge?.webViewReady) {
      try {
        window.AndroidBridge.webViewReady();
      } catch (error) {
        console.warn('AndroidBridge.webViewReady failed', error);
      }
    }

    return () => {
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('message', handleMessage);
    };
  }, []);

  const vocabulary = useMemo(() => getVocabulary(analysisData), [analysisData]);
  const questions = useMemo(() => getQuestions(analysisData), [analysisData]);

  if (!analysisData) {
    return (
      <main className="app-shell waiting">
        <section className="card waiting-card">
          <p className="eyebrow">Capstone Analysis</p>
          <h1>앱에서 분석 데이터를 기다리는 중입니다.</h1>
          <p className="muted">Android WebView에서 분석 결과가 전달되면 이 화면에 표시됩니다.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="top-card">
        <p className="eyebrow">Capstone Analysis</p>
        <h1>분석 결과</h1>
        <div className="meta-row">
          <span>{renderValue(analysisData.code, '코드 없음')}</span>
          {lastUpdatedAt && <span>{lastUpdatedAt.toLocaleTimeString('ko-KR')}</span>}
        </div>
      </header>

      <Section title="기본 정보">
        <Field label="code" value={analysisData.code} />
        <Field label="topic" value={analysisData.topic} />
        <Field label="commentary" value={analysisData.commentary} />
      </Section>

      <Section title="지문">
        <p className="passage">{renderValue(analysisData.passage)}</p>
      </Section>

      <Section title="문장별 구문 분석">
        <SentenceAnalysis data={analysisData} />
      </Section>

      <Section title="Vocabulary">
        <VocabularyList items={vocabulary} />
      </Section>

      <Section title="Generated Questions">
        <QuestionList items={questions} />
      </Section>

      <Section title="원본 JSON">
        <pre className="json-view">{JSON.stringify(analysisData, null, 2)}</pre>
      </Section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
