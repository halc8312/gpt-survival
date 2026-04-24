# 星屑コロニー / Stardust Colony

GitHub Pages 向けの静的ブラウザゲーム MVP です。Phase 0–7 の技術基盤として、データ/アセット読み込み、64×64 のアイソメトリック地形表示、カメラ操作、PC/スマホのタイル・資源・建物選択、建築ゴーストプレビュー、建物配置、資源採取、共有在庫、レシピベースの単発生産進行、基礎的な電力シミュレーションまでを実装しています。

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
- `recipes.json` を source-of-truth にした作業台 / 精錬炉 / 加工機の単発生産
- 生産開始時の入力消費、ゲームループベースの進行、完了時の出力在庫追加
- 選択中の生産建物に対するレシピ表示、レシピ選択、開始、進行状況、結果表示
- モバイルでの「タップで予定地選択 → 配置ボタンで確定」建築フロー
- safe-area inset を考慮したモバイル下部ツールバー、横スクロール式の建築候補列、分離されたアクション列
- `.build-controls__palette` の pointer/touch 挙動調整によるモバイル施設バー横スクロール修正
- モバイル施設バー上での横スワイプ時にマップドラッグや誤建物選択が混線しにくい操作調整
- FPS、ロード状況、カメラ、タイル/資源/建物/在庫/建築状態、採取状態を表示するデバッグオーバーレイ
- 選択建物名、利用可能レシピ、選択/稼働中レシピ、生産進行、最後の生産結果を含む拡張デバッグオーバーレイ
- `buildings.json` / `constants.json` を source-of-truth にした day/night 対応の電力シミュレーション
- `building_crash_core` / 小型発電機 / 太陽光パネル / 蓄電池の発電・燃料・蓄電反映
- 消費電力を持つ建物の powered / unpowered 判定、優先度順の停電、デバッグ表示
- `building_smelter_mk1` / `building_assembler_mk1` などの停電時生産停止・復電時再開
- unpowered 建物の暗色表示と下部 UI の電力収支サマリー

## Controls

### PC

- `WASD` / 矢印キー: カメラ移動
- マウスドラッグ: カメラ移動
- マウスホイール: ズーム
- 左クリック: 資源ノードがあれば資源選択、建築モードでは配置可能なら建築確定、なければタイル/建物選択
- `H`: 選択中の資源を採取
- `[` / `]`: 選択中の生産建物のレシピ切り替え
- `P`: 選択中の生産建物で現在レシピ、または最初の実行可能レシピを開始
- `1`: `building_basic_shelter`
- `2`: `building_storage_yard`
- `3`: `building_manual_workbench`
- `4`: `building_small_generator`
- `5`: `building_basic_miner`
- `6`: `building_smelter_mk1`
- `7`: `building_assembler_mk1`
- `8`: `building_research_station`
- `9`: `building_solar_panel_mk1`
- `0`: `building_battery_bank_mk1`
- `Enter`: 現在の建築ゴーストを確定
- `Escape` / 右クリック: 建築モード解除

### Mobile / touch

- 1本指ドラッグ: カメラ移動
- 1本指タップ: タイル / 資源 / 建物の選択、建築モード中は配置予定地の選択のみ
- 2本指ピンチ: ズーム
- 画面下部の横スクロール建築ボタン: `1`〜`0` と同じ建物を選択
- `採取`: 選択中の資源を採取（建築モード中は無効）
- `生産`: 選択中の生産建物で現在レシピ、または最初の実行可能レシピを開始
- `配置`: 現在の建築ゴーストを明示的に確定
- `解除`: 建築モード解除

建築ゴーストは建築モード中にホバー中、または最後にタップしたタイルを左上基準に表示されます。PC ではクリックまたは `Enter` で配置でき、スマホ/タッチ/粗いポインタでは即配置されず、`配置` ボタンでのみ確定します。配置可能なら緑系、不可ならオレンジ/赤系で表示され、不可理由はデバッグオーバーレイで確認できます。スマホではデバッグオーバーレイを折りたたみ、必要なときだけ展開できます。初期状態ではマップ中心付近に `building_crash_core` が配置されます。資源を選択すると残量、枯渇状態、候補ドロップ、最後の採取結果がデバッグオーバーレイと下部ログに表示されます。生産建物を選択すると、対応レシピ一覧、現在レシピ、進行率、最後の生産結果がデバッグオーバーレイと下部 UI に表示されます。電力消費を持つ建物は発電量・蓄電量が足りないと停止し、DebugOverlay と下部 UI の電力サマリーで発電 / 消費 / 蓄電 / day-night 状態を確認できます。

## Known limitations

- Phase 7 の基礎まで実装しています
- 研究画面、研究による建物/レシピ解放、住民AI、ドローンAI、自動採取予約、コンベア搬送、敵AI、イベント、セーブ/ロード、音声、最終 UI は未実装です
- 建物は静止画表示のみで、稼働アニメーションや状態変化表示は未実装です
- 生産は単発のみで、自動リピート、詳細キュー、建物ごとの個別在庫は未実装です
- 電力は建物定義ベースの単純な全体収支シミュレーションのみで、電線・送電網 UI・詳細優先度 UI・建物別内部蓄電は未実装です
- 研究画面、住民AI、ドローンAI、イベント、セーブ/ロードは今回まだ実装していません
- 地形生成は決定論的ですが、MVP 用の簡易リージョン分割です
- タイル/資源画像は描画用に縮小表示しています

## Phase 8 candidate

次フェーズでは以下を追加しやすい構成にしています。

- 電力ネットワーク / 電線 / 供給範囲の可視化
- 研究画面と研究による建物 / レシピ解放
- 建物ごとの内部在庫、搬送、入出力ルールの追加
- より完成版に近い常設 UI とログ表示

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
