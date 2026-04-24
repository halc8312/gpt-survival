# 星屑コロニー / Stardust Colony

GitHub Pages 向けの静的ブラウザゲーム MVP です。Phase 0–3 の技術基盤として、データ/アセット読み込み、64×64 のアイソメトリック地形表示、カメラ操作、タイル/資源選択、資源ノード描画、建築ゴーストプレビューまでを実装しています。

## Local run

任意の静的サーバーでリポジトリルートを配信してください。

```bash
cd /home/runner/work/gpt-survival/gpt-survival
python -m http.server 8000
```

その後、`http://localhost:8000/` をブラウザで開きます。

## GitHub Pages deployment

このリポジトリはビルド不要の静的構成です。

1. デフォルトブランチに `index.html`, `src/`, `styles/`, `assets/` を含める
2. GitHub の **Settings → Pages** で対象ブランチと `/ (root)` を選ぶ
3. 公開 URL を開く

## Implemented

- `index.html` と全画面キャンバスを使った静的ブラウザ起動
- `requestAnimationFrame` ベースのメインループ
- MVP データパックとマニフェストの読み込み
- `DataRegistry` による ID ベース参照 API
- 起動時バリデーションとブラウザ内エラー表示
- タイル/資源画像の読み込みと欠損時プレースホルダー
- シード付き 64×64 アイソメトリック地形生成
- WASD / 矢印キー移動、ドラッグ移動、マウスホイールズーム
- `resourceGuarantees` を使った決定論的な開始資源ノード配置
- 地形上への資源ノード描画、ホバー、クリック選択
- 建築候補ショートカット切り替えと footprint ベースの建築ゴーストプレビュー
- buildable / map bounds / 資源重なりに基づく建築配置可否表示
- FPS、ロード状況、カメラ、タイル/資源/建築ゴースト情報を表示するデバッグオーバーレイ

## Phase 3 controls

- `WASD` / 矢印キー: カメラ移動
- マウスドラッグ: カメラ移動
- マウスホイール: ズーム
- 左クリック: 資源ノードがあれば資源選択、なければタイル選択
- `1`: `building_basic_shelter`
- `2`: `building_storage_yard`
- `3`: `building_manual_workbench`
- `4`: `building_small_generator`

建築ゴーストはマウスホバー中のタイルを左上基準に表示されます。配置可能なら緑系、不可ならオレンジ/赤系で表示され、不可理由はデバッグオーバーレイで確認できます。

## Known limitations

- Phase 3 の範囲のみ実装しています
- 建築の確定、インベントリ消費、採集、生産、研究、住民AI、ドローンAI、敵AI、イベント、セーブ/ロード、音声、最終 UI は未実装です
- 地形生成は決定論的ですが、MVP 用の簡易リージョン分割です
- タイル/資源画像は描画用に縮小表示しています

## Phase 4 follow-up

次フェーズでは以下を追加しやすい構成にしています。

- 本建築配置と建物実体管理
- 建物重なり判定
- 資源採集やインベントリ消費
- 生産処理との接続

## Project structure

```txt
index.html
src/
  main.js
  engine/
    AssetLoader.js
    DataRegistry.js
    Game.js
    InputController.js
    IsometricCamera.js
    MapRenderer.js
    WorldGenerator.js
  ui/
    DebugOverlay.js
styles/
  main.css
assets/
  data/
  images/
  manifests/
docs/
```
