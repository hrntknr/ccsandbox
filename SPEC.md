# Sandbox Dev Session UI / CLI 仕様書（ドラフト）

## 1. 概要

本ソフトウェアは、GitHub（GitHub.com および GitHub Enterprise）上の任意リポジトリを選択し、指定したブランチ構成でローカルに clone した上で devcontainer を起動し、起動したコンテナへ xterm.js からシェル接続できる「セッション型開発環境」を提供する。

操作は **Web UI** を中心に行い、CLI は **Web UI サーバを起動するための入口**として提供する（CLI からセッションを直接操作しない）。


## 2. 用語

- **Session（セッション）**: repo / workspace（clone先ディレクトリ）/ devcontainer（Dockerコンテナ）/ terminal tabs を束ねた単位
- **Workspace**: clone を行うローカルディレクトリ
- **Base Branch**: 派生元となるブランチ（既定は repo の default branch）
- **Work Branch**: 作業ブランチ。作成時に `base` から新規作成して checkout する
- **PAT**: GitHub Personal Access Token
- **apiBase**: GitHub API Base URL（GitHub.com / GHE を統一的に扱う）


## 3. スコープ

### 3.1 対応する機能
- CLI により Web UI サーバを起動
- CLI に渡された PAT と apiBase を用いた repository 一覧取得
- Web UI からセッション作成（repo/base/work branch 指定）
- `git clone` → `git checkout -b <work> <base>`
- `.devcontainer` が存在する場合のみ devcontainer CLI で起動（未定義はエラー）
- 起動後、xterm.js から `docker exec` 相当でコンテナへ接続
- Session 内で複数タブ（複数PTY）を扱う
- UI からコンテナの Stop / Start / Remove を提供
- 永続化は `.ccsandbox` 配下に JSON ファイルで行う

### 3.2 非対応（初期）
- devcontainer 未定義 repo のフォールバック（Dockerfile 等）
- devcontainer の仕様解釈・補完（devcontainer CLI に一任）


## 4. 画面仕様（UX）

### 4.1 レイアウト
- 左: Sessions ペイン（セッション一覧）
- 右: ターミナル領域（xterm.js）
- 初期状態（セッション未選択）: 右側に空状態文言を表示  
  `Select a session or create a new one`

### 4.2 Sessions ペイン
表示項目（最小）
- Title
- Repository（owner/name）
- Base branch
- Work branch
- State（簡易ステート。詳細は「5. State」）

※ `Last run` 等の表示は行わない。

操作
- `New` ボタン: 新規セッション作成モーダルを開く
- 一覧からセッション選択: 右側のターミナル領域を当該セッションへ切替
- セッション削除（必要なら）: 実装範囲に含める場合は確認ダイアログを必須とする

### 4.3 New Session モーダル
入力項目
- Title（任意）
- Repository（ドロップダウン。PATで取得した一覧）
- Base Branch（入力。デフォルトは repo の default branch）
- Work Branch（入力。例: `feature/foo`）

Create 時の動作
- `git checkout -b <work> <base>` を行い、work branch を作成して checkout する

ボタン
- Cancel / Create


## 5. State（簡易）

UI 表示用のステートは最小限とする（詳細な進捗はログ/メッセージで表現）。

- `READY` : workspace が存在し復帰可能（コンテナ稼働の有無は問わない）
- `RUNNING` : コンテナ稼働中で terminal attach 可能
- `ERROR` : 直近操作が失敗（詳細はログで提示）


## 6. CLI 仕様（Web UI サーバ起動）

### 6.1 役割
CLI は Web UI サーバを起動するためのコマンドである。CLI から session を create/stop/list 等するインターフェイスは提供しない。

### 6.2 コマンド（案）
npx ccccsandbox:latest

主なオプション
- `--pat <token>`: GitHub PAT（必須）
- `--api-base <url>`: GitHub API Base URL（必須）
  - GitHub.com: `https://api.github.com`
  - GHE: `https://ghe.example.com/api/v3`
- `--repo-dir <path>`: workspace ルート（既定: `$HOME/.ccsandbox`）
- `--dir-format <format>`: workspace のディレクトリ名フォーマット
- `--listen <host>`: bind host（既定: `127.0.0.1`）
- `--port <port>`: listen port（既定: 実装で決定。`0`=自動割当も可）
- `--devcontainer-cli <path>`: devcontainer CLI のパス（任意）

セキュリティ注意
- `--pat` はプロセス一覧に露出しうるため、将来的に `--pat-stdin` / env 対応を検討する余地がある（初期要件では option 入力で確定）。


## 7. 永続化（JSON / .ccsandbox）

### 7.1 保存場所
`repoDir`（既定 `$HOME/.ccsandbox`）配下に管理領域を作る。

例:
- `${repoDir}/.ccsandbox/`
  - `sessions.json`
  - `sessions/<sessionId>.json`（任意）

### 7.2 セッション情報（スキーマ要件）
最低限保持する項目
- `sessionId`（UUID等）
- `title`
- `repo`（owner/name）
- `apiBase`
- `baseBranch`
- `workBranch`
- `workspacePath`（絶対パス または repoDir 相対）
- `state`（READY/RUNNING/ERROR）
- `createdAt`

任意（復帰に使う）
- `containerId`（消えてもよい・揮発）
- `containerName`（任意）
- `tabs`（terminal tabs の永続化）
  - `tabs`: [{ `tabId`, `title`, `shell` }...]

復帰方針
- `containerId` が無効でも `workspacePath` が存在すれば復帰可能とする（再起動は devcontainer CLI に一任）。


## 8. Workspace（clone ディレクトリ）

### 8.1 ディレクトリ決定
- `repoDir` 既定: `$HOME/.ccsandbox`
- `dirName` 既定: `{repoName}.{workBranchEscaped}`
- `workspacePath = join(repoDir, dirName)`

`repoName`
- `owner/name` の `name` 部分

`workBranchEscaped`
- `/` は `_` に置換する
- その他不正な文字は replace する（「8.2 文字置換ルール」参照）

### 8.2 文字置換ルール（workBranch → dirName 用）
目的: OS のファイル名として安全な文字集合へ正規化する。

- `/` → `_`
- それ以外の「不正な文字」は `_` に置換
  - 不正判定の具体:
    - 推奨: `[A-Za-z0-9._-]` 以外は `_` に置換
- 連続する `_` は 1 つに畳む（任意だが推奨）
- 先頭/末尾の `_` は trim（任意だが推奨）

例
- `feature/foo` → `feature_foo`
- `bugfix/foo:bar` → `bugfix_foo_bar`

### 8.3 衝突時の挙動
`workspacePath` が既に存在する場合は **エラー** とし、セッション作成を中断する。


## 9. GitHub 連携仕様

### 9.1 repository 一覧取得
- `--pat` と `--api-base` を使用して repository 一覧を取得する
- 表示名は `owner/name`
- UI の repository ドロップダウンに反映する

### 9.2 default branch の取得
- 選択された repo の default branch を取得し、New Session モーダルの Base Branch にデフォルト値として反映する


## 10. git clone（credential helper）

### 10.1 認証方針
- `git clone` は **credential helper を使って認証**する
- Token を clone URL に埋め込まない（ログ漏洩を避ける）

### 10.2 実装要件
- セッション作成時、clone 操作の前に credential helper に PAT を登録（スコープ/ホストは `apiBase` から導出）
- clone 完了後の credential の扱い（保持/削除）は実装で決定するが、少なくともログに token が出ないこと

### 10.3 ブランチ作成
clone 後に以下を行う:
- `git checkout -b <workBranch> <baseBranch>`


## 11. devcontainer 起動（devcontainer CLI に一任）

### 11.1 前提
- workspace に `.devcontainer` 定義が存在すること
  - 例: `.devcontainer/devcontainer.json` 等
- 定義が存在しない場合は **エラー（未サポート）**

### 11.2 起動
- devcontainer CLI を使用して起動する
  - 例: `devcontainer up --workspace-folder <workspacePath>` 相当
- devcontainer の解釈（compose 等）は devcontainer CLI に一任する

### 11.3 起動後の情報取得
- 起動後、コンテナ識別子（containerId / containerName）を取得し、セッションに紐付ける
- containerId が後で失効しても、workspace があれば復帰可能


## 12. コンテナ操作（UI提供）

UI から以下を提供する:
- Stop: `docker stop <container>`
- Start: `docker start <container>`
- Remove: `docker rm <container>`（必要に応じて `-f` を検討）

注意
- Remove 後に再度 RUNNING に戻す場合は devcontainer CLI により再起動する（詳細は実装で定義）


## 13. ターミナル（xterm.js）仕様

### 13.1 接続方式
- xterm.js ⇄（WebSocket等）⇄ バックエンド ⇄ PTY ⇄ `docker exec -it <container> <shell>`

### 13.2 Shell
- 既定: `bash`
- `bash` が存在しない場合は `sh` にフォールバック

### 13.3 複数タブ（session内）
- 1 タブ = 1 PTY = 1 `docker exec`
- 右ペイン上部にタブバーを持つ
  - `+` で新規タブ
  - タブ名は編集可能（任意）
- タブ情報はセッション JSON に保存し復元する

### 13.4 リサイズ
- xterm.js の cols/rows 変更に応じて PTY を resize し、exec 側へ反映する


## 14. エラーハンドリング（代表例）

- PAT 不正 / 権限不足（repo一覧取得失敗）
- repo clone 失敗（認証/存在しない/ネットワーク）
- base branch が存在しない
- `.devcontainer` が見つからない（未サポート）
- devcontainer CLI 起動失敗
- docker daemon に接続不可
- container が存在しない / 起動していないのに attach した
- `docker exec` 失敗（shell 不在など）

表示方針
- セッションの state を `ERROR` に設定
- エラー内容と関連ログを UI に表示する（token を含めない）


## 15. 仕様上の確定事項（合意済み）

- Sessions ペインに Last run は表示しない
- state は `READY / RUNNING / ERROR` の簡易とする
- CLI は Web UI を起動する目的のみ（CLIでsession操作しない）
- git clone は credential helper を使う
- devcontainer の挙動は devcontainer CLI に一任する
- `devcontainer down` は使わず、コンテナ操作は docker command を使う
- 永続化は `.ccsandbox` 配下に JSON として保存する
- containerId がなくなっても workspace があれば復帰可能
- workspace ディレクトリ衝突時はエラー
- Work Branch は Base Branch から作成して checkout する（`checkout -b`）
- Work Branch の `/` は `_` にエスケープし、その他不正な文字は replace する
- Session 内で terminal の複数タブを提供する
- UI から Stop/Start/Remove を提供する

