# 星屑コロニー / Stardust Colony

GitHub Pages 向けの静的ブラウザゲーム MVP です。Phase 0–2 の技術基盤として、データ/アセット読み込み、64×64 のアイソメトリック地形表示、カメラ操作、タイル選択までを実装しています。

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
- タイル画像の読み込みと欠損時プレースホルダー
- シード付き 64×64 アイソメトリック地形生成
- WASD / 矢印キー移動、ドラッグ移動、マウスホイールズーム
- ホバー/クリックによるタイル判定とハイライト
- FPS、ロード状況、カメラ、選択中タイル情報を表示するデバッグオーバーレイ

## Known limitations

- Phase 0–2 の範囲のみ実装しています
- 建築配置、インベントリ、採集、レシピ進行、研究進行、AI、イベント、セーブ/ロード、音声、最終 UI は未実装です
- 地形生成は決定論的ですが、MVP 用の簡易リージョン分割です
- タイル画像は描画用に縮小表示しています

## Phase 3 follow-up

次フェーズでは以下を追加しやすい構成にしています。

- 資源ノード配置
- 地形上への資源ノード描画
- 建築ゴーストプレビュー
- 建築配置バリデーション

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
