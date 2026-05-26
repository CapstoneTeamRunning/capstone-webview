import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const MESSAGE_TYPE = 'ANALYSIS_DATA';
const ARROW_COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#ef4444'];

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

function unwrapPayload(value) {
  let current = value;

  if (Array.isArray(current)) {
    current = current[0] ?? null;
  }

  if (current?.result_json) {
    current = current.result_json;
  } else if (current?.resultJson) {
    current = current.resultJson;
  }

  if (Array.isArray(current)) {
    current = current[0] ?? null;
  }

  return current;
}

function normalizePayload(message) {
  if (!message) return null;

  if (message.type === MESSAGE_TYPE) {
    return unwrapPayload(message.payload);
  }

  if (message.analysis_data || message.analysisData || message.sentences || message.result_json || message.resultJson) {
    return unwrapPayload(message);
  }

  return null;
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

function getRootChunks(data) {
  const root = getAnalysisRoot(data);

  return firstArray(
    data?.syntax_analysis_chunks,
    data?.chunks,
    root?.syntax_analysis_chunks,
    root?.chunks,
    root?.syntax_analysis?.chunks
  );
}

function getRawSentences(data) {
  const root = getAnalysisRoot(data);
  const sentences = firstArray(
    Array.isArray(data?.analysis_data) ? data.analysis_data : null,
    Array.isArray(data?.analysisData) ? data.analysisData : null,
    data?.syntax_analysis_sentences,
    data?.sentences,
    root?.syntax_analysis_sentences,
    root?.sentences,
    root?.sentence_analysis,
    root?.sentenceAnalysis,
    root?.syntax_analysis?.sentences
  );

  if (sentences.length > 0) return sentences;

  const chunks = getRootChunks(data);
  if (chunks.length === 0) return [];

  return [
    {
      sentence_no: 1,
      full_translation: data?.full_translation ?? data?.fullTranslation ?? root?.full_translation ?? '',
      chunks,
    },
  ];
}

function scalar(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  if (Array.isArray(value)) return value.join('');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function normalizeChunk(chunk, index) {
  if (!chunk || typeof chunk !== 'object') {
    return {
      chunk_id: index,
      target_text: scalar(chunk),
      korean_meaning: '',
      syntax_tag: null,
      grammar_note: null,
      box_color: null,
      text_color: null,
      bracket_open: null,
      bracket_close: null,
      modifies_chunk_id: null,
    };
  }

  return {
    chunk_id: chunk.chunk_id ?? chunk.chunkId ?? chunk.id ?? index,
    target_text: scalar(chunk.target_text ?? chunk.targetText ?? chunk.text ?? chunk.word),
    korean_meaning: scalar(chunk.korean_meaning ?? chunk.koreanMeaning ?? chunk.meaning),
    syntax_tag: chunk.syntax_tag ?? chunk.syntaxTag ?? chunk.tag ?? null,
    grammar_note: chunk.grammar_note ?? chunk.grammarNote ?? chunk.note ?? null,
    box_color: chunk.box_color ?? chunk.boxColor ?? null,
    text_color: chunk.text_color ?? chunk.textColor ?? null,
    bracket_open: chunk.bracket_open ?? chunk.bracketOpen ?? null,
    bracket_close: chunk.bracket_close ?? chunk.bracketClose ?? null,
    modifies_chunk_id: chunk.modifies_chunk_id ?? chunk.modifiesChunkId ?? chunk.modifies ?? null,
  };
}

function getSentenceChunks(sentence) {
  return firstArray(
    sentence?.chunks,
    sentence?.syntax_analysis_chunks,
    sentence?.syntax_chunks
  );
}

function normalizeSentence(sentence, index) {
  if (!sentence || typeof sentence !== 'object') {
    return {
      sentence_no: index + 1,
      full_translation: '',
      is_topic_sentence: false,
      chunks: [normalizeChunk(sentence, 0)],
    };
  }

  let chunks = getSentenceChunks(sentence);
  if (chunks.length === 0 && (sentence.target_text || sentence.targetText || sentence.text || sentence.sentence)) {
    chunks = [sentence];
  }

  return {
    sentence_no: sentence.sentence_no ?? sentence.sentenceNo ?? sentence.no ?? index + 1,
    full_translation: sentence.full_translation ?? sentence.fullTranslation ?? sentence.translation ?? '',
    is_topic_sentence: Boolean(sentence.is_topic_sentence ?? sentence.isTopicSentence),
    chunks: chunks.map(normalizeChunk),
  };
}

function normalizeAnalysis(data) {
  const payload = unwrapPayload(data);
  if (!payload || typeof payload !== 'object') return null;

  const sentences = getRawSentences(payload).map(normalizeSentence);
  if (sentences.length === 0) return null;

  return {
    code: payload.code ?? '',
    topic: payload.topic ?? '',
    commentary: payload.commentary ?? '',
    analysis_data: { sentences },
  };
}

function safeIdPart(value) {
  return scalar(value, 'x').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function SentenceViewer({ sentence }) {
  const containerRef = useRef(null);
  const [arrows, setArrows] = useState([]);
  const sentenceId = safeIdPart(sentence.sentence_no);

  useEffect(() => {
    const drawArrows = () => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const nextArrows = [];
      let arrowIndex = 0;

      sentence.chunks.forEach((chunk) => {
        if (chunk.modifies_chunk_id === null || chunk.modifies_chunk_id === undefined || chunk.modifies_chunk_id === '') {
          return;
        }

        const sourceId = `chunk-${sentenceId}-${safeIdPart(chunk.chunk_id)}`;
        const targetId = `chunk-${sentenceId}-${safeIdPart(chunk.modifies_chunk_id)}`;
        const sourceEl = document.getElementById(sourceId);
        const targetEl = document.getElementById(targetId);

        if (!sourceEl || !targetEl) return;

        const sourceRect = sourceEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const startX = sourceRect.left + sourceRect.width / 2 - containerRect.left;
        const startY = sourceRect.bottom - containerRect.top;
        const endX = targetRect.left + targetRect.width / 2 - containerRect.left;
        const endY = targetRect.bottom - containerRect.top;
        const dropY = Math.max(startY, endY) + 15 + arrowIndex * 8;

        nextArrows.push({
          d: `M ${startX} ${startY + 2} L ${startX} ${dropY} L ${endX} ${dropY} L ${endX} ${endY + 6}`,
          colorIndex: arrowIndex % ARROW_COLORS.length,
        });
        arrowIndex += 1;
      });

      setArrows(nextArrows);
    };

    const timer = window.setTimeout(drawArrows, 120);
    window.addEventListener('resize', drawArrows);

    let observer = null;
    if (window.ResizeObserver && containerRef.current) {
      observer = new ResizeObserver(drawArrows);
      observer.observe(containerRef.current);
    }

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', drawArrows);
      observer?.disconnect();
    };
  }, [sentence, sentenceId]);

  return (
    <section ref={containerRef} className={`sentence-viewer ${sentence.is_topic_sentence ? 'topic-sentence' : ''}`}>
      <svg className="arrow-layer" aria-hidden="true">
        <defs>
          {ARROW_COLORS.map((color, index) => (
            <marker key={color} id={`arrowhead-${sentenceId}-${index}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <polygon points="0 0, 6 3, 0 6" fill={color} />
            </marker>
          ))}
        </defs>
        {arrows.map((arrow, index) => (
          <path
            key={index}
            d={arrow.d}
            fill="none"
            stroke={ARROW_COLORS[arrow.colorIndex]}
            strokeWidth="2"
            markerEnd={`url(#arrowhead-${sentenceId}-${arrow.colorIndex})`}
          />
        ))}
      </svg>

      <div className="sentence-header">
        <div className={`sentence-number ${sentence.is_topic_sentence ? 'topic-number' : ''}`}>{sentence.sentence_no}</div>
        {sentence.is_topic_sentence && <span className="topic-badge">핵심 주제문</span>}
      </div>

      <div className="chunks-row">
        {sentence.chunks.map((chunk, index) => (
          <div className="chunk-token" id={`chunk-${sentenceId}-${safeIdPart(chunk.chunk_id)}`} key={`${chunk.chunk_id}-${index}`}>
            {chunk.syntax_tag && <span className="syntax-tag">{chunk.syntax_tag}</span>}
            <div className="chunk-line">
              {chunk.bracket_open && <span className="bracket">{scalar(chunk.bracket_open)}</span>}
              <span className={`target-text ${chunk.box_color === 'red' ? 'box-red' : ''} ${chunk.box_color === 'blue' ? 'box-blue' : ''} ${chunk.text_color === 'green' ? 'text-green' : ''}`}>
                {chunk.target_text}
              </span>
              {chunk.bracket_close && <span className="bracket">{scalar(chunk.bracket_close)}</span>}
            </div>
            <span className="korean-meaning">{chunk.korean_meaning}</span>
            <div className="grammar-slot">
              {chunk.grammar_note && <span className="grammar-note">{chunk.grammar_note}</span>}
            </div>
          </div>
        ))}
      </div>

      {sentence.full_translation && <div className="full-translation">▶ {sentence.full_translation}</div>}
    </section>
  );
}

function VisualAnalysis({ analysis }) {
  return (
    <main className="app-shell analysis-only">
      <div className="visual-analysis">
        {analysis.analysis_data.sentences.map((sentence) => (
          <SentenceViewer key={sentence.sentence_no} sentence={sentence} />
        ))}
      </div>
    </main>
  );
}

function App() {
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    const handleMessage = (event) => {
      const message = parseMessageData(event.data);
      const payload = normalizePayload(message);
      const normalized = normalizeAnalysis(payload);

      if (normalized) {
        setAnalysis(normalized);
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

  if (!analysis) {
    return (
      <main className="app-shell waiting">
        <section className="waiting-card">
          <p className="eyebrow">Capstone Analysis</p>
          <h1>앱에서 분석 데이터를 기다리는 중입니다.</h1>
          <p className="muted">Android WebView에서 분석 결과가 전달되면 이 화면에 표시됩니다.</p>
        </section>
      </main>
    );
  }

  return <VisualAnalysis analysis={analysis} />;
}

createRoot(document.getElementById('root')).render(<App />);
