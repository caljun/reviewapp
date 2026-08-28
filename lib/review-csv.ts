import Papa from 'papaparse';

export type Review = { text: string; rating?: number };
export type CsvTable = { headers: string[]; rows: string[][] };

export function parseReviewCsv(source: string): CsvTable {
  if (!source.replace(/^\uFEFF/, '').trim()) throw new Error('ファイルが空です。');
  const parsed = Papa.parse<string[]>(source.replace(/^\uFEFF/, ''), { delimiter: ',', skipEmptyLines: false });
  if (parsed.errors.length) throw new Error('CSVの読み込みに失敗しました。引用符や区切りを確認してください。');
  const [first, ...rest] = parsed.data;
  if (!first?.length || first.some(h => !h.trim())) throw new Error('ヘッダーがありません。先頭行に各列の名前を指定してください。');
  const rows = rest.filter(row => row.some(cell => cell.trim()));
  if (rows.some(row => row.length !== first.length)) throw new Error('CSVの読み込みに失敗しました。各行の列数を確認してください。');
  return { headers: first.map(h => h.trim()), rows };
}

export function mapCsvReviews(table: CsvTable, textColumn: string, ratingColumn: string): Review[] {
  if (textColumn === '' || !table.headers[Number(textColumn)]) throw new Error('レビュー本文列を選択してください。');
  return table.rows.flatMap(row => {
    const text = row[Number(textColumn)]?.trim();
    if (!text) return [];
    const raw = ratingColumn === '' ? '' : (row[Number(ratingColumn)] ?? '').trim();
    const rating = /^[1-5](?:\.0+)?$/.test(raw) ? Number(raw) : undefined;
    return [{ text, ...(rating === undefined ? {} : { rating }) }];
  });
}

export function csvReviewError(reviews: Review[]): string {
  if (!reviews.length) return '有効なレビューが0件です。';
  if (reviews.length > 50) return 'レビューが50件を超えています。';
  if (reviews.some(r => r.text.length > 2000)) return '1レビューは最大2,000文字です。';
  if (reviews.reduce((n, r) => n + r.text.length, 0) > 50000) return 'レビューの合計は最大50,000文字です。';
  return '';
}

export function reviewsToText(reviews: Review[]): string {
  return reviews.map(r => `${r.rating === undefined ? '' : `★${r.rating}\n`}${r.text}`).join('\n\n');
}
