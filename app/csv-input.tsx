'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { csvReviewError, mapCsvReviews, parseReviewCsv, type CsvTable, type Review } from '@/lib/review-csv';

export type CsvInputState = { reviews: Review[]; error: string; busy: boolean };
export default function CsvInput({ onChange }: { onChange: (state: CsvInputState) => void }) {
  const [table, setTable] = useState<CsvTable | null>(null);
  const [textColumn, setTextColumn] = useState('');
  const [ratingColumn, setRatingColumn] = useState('');
  const [fileError, setFileError] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const mapped = useMemo(() => {
    if (!table) return { reviews: [], error: '' };
    try {
      const reviews = mapCsvReviews(table, textColumn, ratingColumn);
      return { reviews, error: csvReviewError(reviews) };
    } catch (e) { return { reviews: [], error: (e as Error).message }; }
  }, [table, textColumn, ratingColumn]);
  useEffect(() => { onChange({ reviews: mapped.reviews, error: fileError || mapped.error, busy }); }, [mapped, fileError, busy, onChange]);

  async function load(file?: File) {
    if (!file) return;
    const current = ++generation.current;
    setTable(null); setTextColumn(''); setRatingColumn(''); setFileError(''); setBusy(true);
    try {
      if (!/\.csv$/i.test(file.name)) throw new Error('CSVファイルを選択してください。');
      if (!file.size) throw new Error('ファイルが空です。');
      if (file.size > 5 * 1024 * 1024) throw new Error('CSVファイルは5MBまでです。');
      const buffer = await file.arrayBuffer();
      let content: string;
      try { content = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch { throw new Error('読み込みに失敗しました。UTF-8形式のCSVを選択してください。'); }
      const parsed = parseReviewCsv(content);
      if (current === generation.current) setTable(parsed);
    } catch (e) { if (current === generation.current) setFileError(e instanceof Error ? e.message : '読み込みに失敗しました。'); }
    finally { if (current === generation.current) setBusy(false); }
  }

  return <div className="csv-input">
    <label className="field"><span>CSVファイルを選択</span><input type="file" accept=".csv,text/csv" aria-describedby="csv-help" onChange={e => { void load(e.target.files?.[0]); }} /></label>
    <p id="csv-help" className="privacy-note">UTF-8・5MBまで。先頭行は列名として読み込みます。ファイル自体は送信されません。</p>
    {busy && <p role="status">CSVを読み込んでいます…</p>}
    {table && <>
      <div className="field-row"><label className="field"><span>レビュー本文の列（必須）</span><select value={textColumn} onChange={e => setTextColumn(e.target.value)} required><option value="">列を選択してください</option>{table.headers.map((header, index) => <option key={index} value={index}>{header}（{index + 1}列目）</option>)}</select></label>
        <label className="field"><span>星評価の列（任意）</span><select value={ratingColumn} onChange={e => setRatingColumn(e.target.value)}><option value="">指定しない</option>{table.headers.map((header, index) => <option key={index} value={index}>{header}（{index + 1}列目）</option>)}</select></label></div>
      {mapped.reviews.length > 0 && <section aria-label="CSVの先頭5件プレビュー"><h3>先頭{Math.min(5, mapped.reviews.length)}件のプレビュー</h3><div className="review-list">{mapped.reviews.slice(0, 5).map((r, i) => <article key={i} className="review-item"><span className="number">{i + 1}</span><div><span className="stars">{r.rating === undefined ? '評価なし' : `★${r.rating}`}</span><p>{r.text}</p></div></article>)}</div></section>}
    </>}
    {(fileError || mapped.error) && <p role="alert" className="error-message">{fileError || mapped.error}</p>}
  </div>;
}
