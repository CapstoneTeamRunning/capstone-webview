import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const MESSAGE_TYPE = 'ANALYSIS_DATA';
const ARROW_COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#ef4444'];
const DEFAULT_TRANSLATION_OFFSET = 32;
const DEFAULT_CHUNK_ROW_GAP = 48;
const MIN_ARROW_ROW_GAP = 56;
const MAX_ARROW_ROW_GAP = 82;
const ARROW_ROW_TOLERANCE = 8;
const ARROW_LANE_START_OFFSET = 18;
const ARROW_LANE_GAP = 9;
const ARROW_INTERVAL_PADDING = 14;
const ARROW_VERTICAL_SLOT_GAP = 10;
const ARROW_ENDPOINT_PADDING = 10;

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

function rangesOverlap(a, b, padding = 0) {
  return Math.max(a[0], b[0]) - padding <= Math.min(a[1], b[1]) + padding;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function allocateLane(lanes, interval) {
  for (let index = 0; index < lanes.length; index += 1) {
    if (!lanes[index].some((used) => rangesOverlap(used, interval, ARROW_INTERVAL_PADDING))) {
      lanes[index].push(interval);
      return index;
    }
  }

  lanes.push([interval]);
  return lanes.length - 1;
}

function countSlot(groupMap, key) {
  const group = groupMap.get(key) ?? { total: 0, used: 0 };
  group.total += 1;
  groupMap.set(key, group);
}

function claimSlot(groupMap, key) {
  const group = groupMap.get(key) ?? { total: 1, used: 0 };
  const index = group.used;
  group.used += 1;
  groupMap.set(key, group);

  return {
    index,
    total: group.total,
  };
}

function slotOffset(index, total) {
  return (index - (total - 1) / 2) * ARROW_VERTICAL_SLOT_GAP;
}

function tokenSlotX(token, slot) {
  return clamp(
    token.centerX + slotOffset(slot.index, slot.total),
    token.left - ARROW_ENDPOINT_PADDING,
    token.right + ARROW_ENDPOINT_PADDING
  );
}

function SentenceViewer({ sentence }) {
  const containerRef = useRef(null);
  const chunksRowRef = useRef(null);
  const [arrows, setArrows] = useState([]);
  const [layout, setLayout] = useState({
    translationOffset: DEFAULT_TRANSLATION_OFFSET,
    rowGap: MIN_ARROW_ROW_GAP,
  });
  const sentenceId = safeIdPart(sentence.sentence_no);

  useLayoutEffect(() => {
    const drawArrows = () => {
      if (!containerRef.current || !chunksRowRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const chunksRowRect = chunksRowRef.current.getBoundingClientRect();
      const tokenRects = [];
      const tokenByChunkId = new Map();
      const nextArrows = [];
      const bandLanes = new Map();
      const startSlotGroups = new Map();
      const endSlotGroups = new Map();
      let arrowIndex = 0;
      let maxArrowY = chunksRowRect.bottom - containerRect.top;

      sentence.chunks.forEach((chunk) => {
        const tokenEl = document.getElementById(`chunk-${sentenceId}-${safeIdPart(chunk.chunk_id)}`);
        if (!tokenEl) return;

        const rect = tokenEl.getBoundingClientRect();
        const token = {
          chunkId: safeIdPart(chunk.chunk_id),
          left: rect.left - containerRect.left,
          right: rect.right - containerRect.left,
          top: rect.top - containerRect.top,
          bottom: rect.bottom - containerRect.top,
          centerX: rect.left + rect.width / 2 - containerRect.left,
          rowIndex: -1,
        };

        tokenRects.push(token);
        tokenByChunkId.set(token.chunkId, token);
      });

      const rows = [];
      tokenRects
        .slice()
        .sort((a, b) => a.bottom - b.bottom || a.left - b.left)
        .forEach((token) => {
          let row = rows.find((candidate) => Math.abs(candidate.bottom - token.bottom) <= ARROW_ROW_TOLERANCE);

          if (!row) {
            row = {
              top: token.top,
              bottom: token.bottom,
              tokens: [],
            };
            rows.push(row);
          }

          row.tokens.push(token);
          row.top = Math.min(row.top, token.top);
          row.bottom = Math.max(row.bottom, token.bottom);
          token.rowIndex = rows.indexOf(row);
        });

      const links = sentence.chunks
        .map((chunk) => {
          if (chunk.modifies_chunk_id === null || chunk.modifies_chunk_id === undefined || chunk.modifies_chunk_id === '') {
            return null;
          }

          const source = tokenByChunkId.get(safeIdPart(chunk.chunk_id));
          const target = tokenByChunkId.get(safeIdPart(chunk.modifies_chunk_id));

          if (!source || !target || source.rowIndex < 0 || target.rowIndex < 0) return null;

          const sameRow = source.rowIndex === target.rowIndex;
          const bandIndex = Math.min(source.rowIndex, target.rowIndex);

          return {
            source,
            target,
            sameRow,
            bandIndex,
            bandKey: `band-${bandIndex}`,
            startSlotKey: `${source.chunkId}-${source.rowIndex}`,
            endSlotKey: `${target.chunkId}-${target.rowIndex}`,
          };
        })
        .filter(Boolean);

      links.forEach(({ startSlotKey, endSlotKey }) => {
        countSlot(startSlotGroups, startSlotKey);
        countSlot(endSlotGroups, endSlotKey);
      });

      links.forEach(({ source, target, sameRow, bandIndex, bandKey, startSlotKey, endSlotKey }) => {
        const lanes = bandLanes.get(bandKey) ?? [];
        bandLanes.set(bandKey, lanes);

        const startX = tokenSlotX(source, claimSlot(startSlotGroups, startSlotKey));
        const endX = tokenSlotX(target, claimSlot(endSlotGroups, endSlotKey));
        const interval = [Math.min(startX, endX), Math.max(startX, endX)];
        const laneIndex = allocateLane(lanes, interval);
        const laneBaseY = rows[bandIndex].bottom + ARROW_LANE_START_OFFSET;
        const laneY = laneBaseY + laneIndex * ARROW_LANE_GAP;
        const sourceAboveTarget = source.rowIndex < target.rowIndex;
        const sourceBelowTarget = source.rowIndex > target.rowIndex;
        const startY = sourceBelowTarget ? source.top - 4 : source.bottom + 4;
        const endY = sameRow
          ? target.bottom + 4
          : sourceAboveTarget
            ? target.top - 8
            : target.bottom + 6;

        nextArrows.push({
          d: `M ${startX} ${startY} L ${startX} ${laneY} L ${endX} ${laneY} L ${endX} ${endY}`,
          colorIndex: arrowIndex % ARROW_COLORS.length,
        });

        maxArrowY = Math.max(maxArrowY, startY, laneY, endY);
        arrowIndex += 1;
      });

      const maxLaneCount = Math.max(0, ...Array.from(bandLanes.values(), (lanes) => lanes.length));
      const nextRowGap = nextArrows.length > 0
        ? clamp(ARROW_LANE_START_OFFSET + maxLaneCount * ARROW_LANE_GAP + 20, MIN_ARROW_ROW_GAP, MAX_ARROW_ROW_GAP)
        : DEFAULT_CHUNK_ROW_GAP;
      const chunksBottom = chunksRowRect.bottom - containerRect.top;
      const nextTranslationOffset = Math.max(
        DEFAULT_TRANSLATION_OFFSET,
        Math.ceil(maxArrowY - chunksBottom + DEFAULT_TRANSLATION_OFFSET)
      );

      setArrows(nextArrows);
      setLayout((current) => {
        if (current.translationOffset === nextTranslationOffset && current.rowGap === nextRowGap) {
          return current;
        }

        return {
          translationOffset: nextTranslationOffset,
          rowGap: nextRowGap,
        };
      });
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
    <section
      ref={containerRef}
      className={`sentence-viewer ${sentence.is_topic_sentence ? 'topic-sentence' : ''}`}
      style={{
        '--translation-offset': `${layout.translationOffset}px`,
        '--chunk-row-gap': `${layout.rowGap}px`,
      }}
    >
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
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd={`url(#arrowhead-${sentenceId}-${arrow.colorIndex})`}
          />
        ))}
      </svg>

      <div className="sentence-header">
        <div className={`sentence-number ${sentence.is_topic_sentence ? 'topic-number' : ''}`}>{sentence.sentence_no}</div>
        {sentence.is_topic_sentence && <span className="topic-badge">핵심 주제문</span>}
      </div>

      <div ref={chunksRowRef} className="chunks-row">
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
