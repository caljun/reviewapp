# ReviewScope

Next.js 16 / React 19 / Firebase匿名認証・Firestore利用枠管理 / Geminiレビュー分析。
CSV入力、Markdownコピー、ランキングCSVダウンロードに対応。
Stripe、決済、Google・メールログイン、分析履歴、レビュー保存、Storageは未実装。

## 設定

既存の `.env.local` とVercelのEnvironment Variablesに設定します。新しいenvファイルは不要です。

- `GEMINI_API_KEY`（既存）
- `GEMINI_MODEL`（任意、既定は `gemini-2.5-flash`）
- 既存の `NEXT_PUBLIC_FIREBASE_*` Webアプリ設定（維持）
- 追加：`FIREBASE_ADMIN_PROJECT_ID`
- 追加：`FIREBASE_ADMIN_CLIENT_EMAIL`
- 追加：`FIREBASE_ADMIN_PRIVATE_KEY`

Adminの3値はFirebaseプロジェクト設定 → サービスアカウントの管理者用認証情報から設定します。
Web SDK設定とは別物です。Web側と同一プロジェクトを指定し、Firestoreへのアクセス権限を持つサービスアカウントを使用してください。
秘密鍵はPEM全文（BEGIN/END行を含む）。文字としての `\n` はサーバーで改行に復元します。
Admin変数・Geminiキーに `NEXT_PUBLIC_` を付けず、Gitやチャットにも貼らないでください。
JSON鍵ファイル自体はリポジトリへ置かないでください。

```sh
npm install
npm run dev
npm test
npm run lint
npm run build
```

## 認証・分析フロー

1. Firebase Authのローカル永続化と `onAuthStateChanged` による既存ユーザー復元を待つ。
2. ユーザーがない場合だけ `signInAnonymously`。同時初期化は同じPromiseを共有。
3. `GET /api/usage` にIDトークンを送信。Admin SDKで検証し、未登録なら `users/{uid}` を作成。既存値は変更しない。
4. ブラウザでUUIDのrequestIdを生成。`POST /api/analyze` にIDトークンと入力配列を送る。
5. トークン検証 → 入力検証 → 利用枠トランザクション予約 → Gemini → 完了記録 → 結果表示。
6. 401の場合のみ、`getIdToken(true)` で更新して同じリクエストを1回再送する。

Adminはserver-onlyモジュール内で遅延初期化し、名前付きアプリを再利用します。
API入力は `{requestId, appName?, focus?, reviews:[{id?,text,rating?}]}`。
requestIdはUUID。レビュー1〜50件、本文1〜2,000文字（空白のみ不可）、本文合計50,000文字、アプリ名100文字、観点500文字。
ratingは指定時に整数1〜5。idは指定時に非負整数。文字数はJavaScriptの文字列長。
本文のバイト上限も700,000バイトで制限します（JSONエスケープ分を考慮）。

Geminiの簡易JSON方式は維持しています。appName・focus・reviewsをデータとして区切って送信し、focusを重点観点にします。
出力のJSON Schema・構造化出力・Zod出力検証・修正再生成は使用しません。
既存のコードブロック除去・JSON.parse・最小限の形確認に失敗した場合、自由文を返します。
空の応答は失敗として返金します。Geminiへの通信タイムアウトは40秒、自動再試行なしです。
入力検証にのみZodを使用。ランキング件数は従来どおりAIの出力であり、正確性を保証しません。

## 利用枠と保存データ

`users/{uid}`：`freeAnalysisUsed`, `remainingCredits`, `createdAt`, `updatedAt`。
初期値は無料未使用・0クレジットです。

`analysisRequests/{requestId}`：`uid`, `reviewCount`, `source`（free/credit）, `status`（reserved/completed/refunded）, `createdAt`, `updatedAt`。
タイムスタンプにはFirestoreのサーバー時刻を使用します。
レビュー本文、分析結果、アプリ名、focus、CSV、IDトークンはFirestoreへ保存しません。

- 未使用の無料枠があり10件以内なら無料枠を予約。
- それ以外は1クレジットで最大50件。残高がなければ403。
- 予約時に無料使用済み／クレジット減算とrequest作成を同一トランザクションで実施。
- 成功時はcompleted。Gemini失敗時はreservedからrefundedへ遷移し、同じトランザクションで返金。
- refunded/completedは再返金しない。同一requestIdは409で拒否し、再分析・再消費しない。
- 通信不明時の画面内再試行は同じrequestIdを保持。明示的な失敗・返金確認後は新しいIDを使用。
- クライアントから残高を編集する機能はありません。Firestore Rulesは匿名認証済みも含め全拒否。Admin SDKのみ操作します。
- `firebase.json` はFirestoreのみ対象。既存の `storage.rules` は今回の対象外で、デプロイしません。

## APIエラー

| HTTP | code | 意味 |
| --- | --- | --- |
| 400 | INVALID_INPUT | 型・件数・文字数・UUID・JSON不正 |
| 401 | UNAUTHORIZED | トークンなし／形式不正／無効／期限切れ |
| 403 | PAID_PLAN_REQUIRED | 無料で11件以上、クレジットなし |
| 403 | FREE_LIMIT_REACHED | 無料使用済み、クレジットなし |
| 409 | REQUEST_RESERVED / REQUEST_COMPLETED / REQUEST_REFUNDED | 同じIDは受付済み |
| 409 | REQUEST_CONFLICT | 別ユーザーが所有するID |
| 500 | SERVER_CONFIGURATION_ERROR | AdminまたはGeminiの設定不足・初期化失敗 |
| 500 | USAGE_DATA_ERROR / SERVER_ERROR | 利用枠の不整合・その他サーバー障害 |
| 502 | ANALYSIS_FAILED | Gemini失敗、返金完了 |
| 503 | REFUND_PENDING / COMPLETION_PENDING | 利用枠の更新失敗、管理者確認が必要 |

秘密値・生のSDKエラー・スタックトレースは返しません。APIレスポンスはno-storeです。

## テストと本番確認

`npm test` は現行のAPI・利用枠ロジック、同時実行、返金、401再送、CSV、書き出し、簡易JSONの自動テストです。
Firestoreのテストは原子的なインメモリアダプター、認証とGeminiはモックです。実Firebaseの統合テストではありません。
旧 `tests/analysis.test.ts` も回帰テストとして残していますが、旧構造化出力の処理は現行Routeでは使用していません。
`test:live` は旧実装用なので今回の本番検証には使わないでください。

本番反映手順：

1. VercelにAdminの3変数を追加（Production、必要ならPreviewも）。既存Firebase/Gemini変数は維持。
2. 変更をコミット・GitHubへpushし、Vercelで再デプロイ。Build Commandは `npm run build`。
3. ルールを反映する場合は `firebase deploy --only firestore:rules --project reviewapp-979b5`。全拒否の方針は変わりません。
4. 通常ブラウザで開き、Firebase Authenticationコンソールに匿名ユーザーが作られること、リロード後に同じUIDで新規作成が増えないことを確認。
5. 無料状態で11件入力時はボタン無効。開発者ツールから有効トークン付きで11件を直接POSTして403を確認。
6. 10件以内で1回分析して成功、Firestoreのuser無料使用済み・request completedを確認。2回目の直接POSTが403であることを確認。
7. 同じrequestIdのPOSTが409、リクエストドキュメントと利用枠が増減しないことを確認。
8. Authorizationなし・無効トークンが401、正常認証付きの不正入力が400であることを確認。
9. CSVの列選択・プレビュー、ランキング、Markdownコピー、CSV保存を確認。
10. 失敗返金は本番キーを壊さず、別のPreview環境で無効な `GEMINI_MODEL` を使って502・refunded・無料枠復帰を確認し、設定を戻す。
11. Firestoreの保存フィールドを確認し、本文や分析結果が含まれないことを確認。

## 既知の制限・運用注意

- 「無料1回」はUID単位です。ブラウザデータ削除・別ブラウザ等で新しい匿名UIDを作れるため、1人1回の厳密な保証やボット対策ではありません。App Check・レート制限・予算上限等は別途必要です。
- プロセス強制終了やFirestore障害ではreservedが残る可能性があります。自動回収ジョブは今回未実装。503時や予約滞留時は、実行が停止済みか管理者が確認してからトランザクションで返金してください。
- completedの結果は保存しないため、レスポンス受信前の切断やリロードで結果を失うと再取得できません。同じIDでの再分析はしません。
- 残高表示は他タブの操作と一時的にずれる場合がありますが、サーバーのトランザクションで制限を強制します。
- ブラウザの匿名認証永続化、実Admin権限、実Firestoreトランザクション、本番Geminiの通し確認は上記手順で実施してください。
- 本アプリはレビュー本文を保存しませんが、Google側の取扱いは各APIの契約・利用条件に依存します。
