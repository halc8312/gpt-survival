# 星屑コロニー / Stardust Colony

GitHub Pages 向けの静的ブラウザゲーム MVP です。Phase 0–5 の技術基盤として、データ/アセット読み込み、64×64 のアイソメトリック地形表示、カメラ操作、PC/スマホのタイル・資源・建物選択、建築ゴーストプレビュー、建物配置の基礎、資源採取と共有在庫への接続までを実装しています。

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
- `resources.json` の `amountRange` / `primaryDrops` を使った決定論的な資源ノード残量と採取結果
- 地形上への資源ノード描画、ホバー、クリック選択、枯渇状態の表示
- 建築候補ショートカット切り替えと footprint ベースの建築ゴーストプレビュー
- buildable / map bounds / 資源 / 既存建物 / 所持資材に基づく建築配置可否表示
- `building_crash_core` の初期配置と建物インスタンス管理
- 建物画像の読み込みとアイソメ風の描画順での建物表示
- スターター在庫からの建築コスト消費
- 手動資源採取とスターター在庫への加算、採取結果ログ表示
- FPS、ロード状況、カメラ、タイル/資源/建物/在庫/建築状態、採取状態を表示するデバッグオーバーレイ

## Controls

### PC

- `WASD` / 矢印キー: カメラ移動
- マウスドラッグ: カメラ移動
- マウスホイール: ズーム
- 左クリック: 資源ノードがあれば資源選択、建築モードで配置可能なら建築確定、なければタイル/建物選択
- `H`: 選択中の資源を採取
- `1`: `building_basic_shelter`
- `2`: `building_storage_yard`
- `3`: `building_manual_workbench`
- `4`: `building_small_generator`
- `5`: `building_basic_miner`
- `6`: `building_smelter_mk1`
- `7`: `building_assembler_mk1`
- `8`: `building_research_station`
- `Enter`: 現在の建築ゴーストを確定
- `Escape` / 右クリック: 建築モード解除

### Mobile / touch

- 1本指ドラッグ: カメラ移動
- 1本指タップ: タイル / 資源 / 建物の選択、または建築モード中の配置
- 2本指ピンチ: ズーム
- 画面下部の建築ボタン: `1`〜`8` と同じ建物を選択
- `採取`: 選択中の資源を採取（建築モード中は無効）
- `配置`: 現在の建築ゴーストを確定
- `解除`: 建築モード解除

建築ゴーストは建築モード中にホバー中、または最後にタップしたタイルを左上基準に表示されます。配置可能なら緑系、不可ならオレンジ/赤系で表示され、不可理由はデバッグオーバーレイで確認できます。スマホではデバッグオーバーレイを折りたたみ、必要なときだけ展開できます。初期状態ではマップ中心付近に `building_crash_core` が配置されます。資源を選択すると残量、枯渇状態、候補ドロップ、最後の採取結果がデバッグオーバーレイと下部ログに表示されます。

## Known limitations

- Phase 5 の範囲のみ実装しています
- 生産レシピ進行、作業台/精錬炉/加工機の稼働、電力シミュレーション、研究画面、住民AI、ドローンAI、資源採取予約、コンベア搬送、敵AI、イベント、セーブ/ロード、音声、最終 UI は未実装です
- 建物は静止画表示のみで、稼働アニメーションや状態変化表示は未実装です
- 地形生成は決定論的ですが、MVP 用の簡易リージョン分割です
- タイル/資源画像は描画用に縮小表示しています

## Phase 5 candidate

次フェーズでは以下を追加しやすい構成にしています。

- 建物インベントリや採取先との接続拡張
- 生産レシピ進行とワークベンチ系施設の稼働
- 電力供給/消費の可視化
- 研究やコロニー進行と建物解放の接続

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
