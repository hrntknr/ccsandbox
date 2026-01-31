# Claude Code CLI 仕様書

Claude Code CLI（バージョン 2.1.6）の自作フロントエンド向け仕様です。

## 基本コマンド

```bash
claude [options] [command] [prompt]
```

## フロントエンド実装に必要な主要オプション

### 1. 非インタラクティブモード

| オプション | 説明 |
|-----------|------|
| `-p, --print` | 非インタラクティブモードで実行し、結果を出力して終了 |

```bash
echo "1+1は?" | claude -p
# 出力: 2です。
```

---

### 2. 出力形式（--output-format）

| 値 | 説明 |
|----|------|
| `text` | プレーンテキスト出力（デフォルト） |
| `json` | 単一のJSON結果 |
| `stream-json` | NDJSON形式のリアルタイムストリーミング（`--verbose`が必須） |

#### JSON出力例

```bash
echo "1+1は?" | claude -p --output-format json
```

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 2075,
  "num_turns": 1,
  "result": "2です。",
  "session_id": "a43e8e5e-991f-44d2-9b1a-f9331e72c0fa",
  "total_cost_usd": 0.04341375,
  "usage": {...},
  "modelUsage": {...}
}
```

#### stream-json出力例

```bash
echo "1+1は?" | claude -p --output-format stream-json --verbose
```

NDJSON形式で複数行出力される：

```json
{"type":"system","subtype":"init","session_id":"...","tools":[...],"model":"claude-opus-4-5-20251101",...}
{"type":"assistant","message":{...}}
{"type":"result","subtype":"success","result":"2です。",...}
```

---

### 3. 入力形式（--input-format）

| 値 | 説明 |
|----|------|
| `text` | プレーンテキスト入力（デフォルト） |
| `stream-json` | NDJSON形式の入力（`--output-format=stream-json`が必須） |

#### 制約条件

- `--input-format stream-json` を使用する場合、`--output-format stream-json` が**必須**
- `--output-format stream-json` を使用する場合、`--verbose` が**必須**

```bash
# 正しい組み合わせ
claude -p \
  --session-id "UUID" \
  --input-format stream-json \
  --output-format stream-json \
  --verbose
```

#### 入力メッセージのtype

| type | 説明 |
|------|------|
| `user` | ユーザーからのメッセージ |
| `control` | 制御メッセージ（パーミッション応答等） |

**注意**: `--output-format stream-json`の出力type（`system`, `assistant`, `result`等）は入力には使用できません。入力は`user`または`control`のみです。

#### ユーザーメッセージ形式

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "メッセージ内容"
  }
}
```

#### 使用例：単一メッセージ

```bash
echo '{"type":"user","message":{"role":"user","content":"1+1は?"}}' | \
  claude -p \
  --session-id "$(python3 -c 'import uuid; print(uuid.uuid4())')" \
  --input-format stream-json \
  --output-format stream-json \
  --verbose
```

#### 使用例：複数メッセージの連続送信

同一プロセス内で複数のメッセージをストリームとして送信可能。セッションが自動的に継続される。

```bash
SESSION_ID=$(python3 -c "import uuid; print(uuid.uuid4())")

(echo '{"type":"user","message":{"role":"user","content":"私の名前は山田です"}}'; \
 sleep 2; \
 echo '{"type":"user","message":{"role":"user","content":"私の名前は何ですか？"}}') | \
  claude -p \
  --session-id "$SESSION_ID" \
  --input-format stream-json \
  --output-format stream-json \
  --verbose
```

**出力：**
```json
{"type":"system","subtype":"init",...}
{"type":"assistant","message":{"content":[{"type":"text","text":"はじめまして、山田さん！"}],...}}
{"type":"result","result":"はじめまして、山田さん！",...}
{"type":"system","subtype":"init",...}
{"type":"assistant","message":{"content":[{"type":"text","text":"山田さんですね。先ほど自己紹介していただきました。"}],...}}
{"type":"result","result":"山田さんですね。...",...}
```

各メッセージごとに `system/init` → `assistant` → `result` のサイクルが発生します。

#### --replay-user-messages オプション

ユーザーメッセージをエコーバックして確認（ACK）として受け取れる。

```bash
echo '{"type":"user","message":{"role":"user","content":"Hello"}}' | \
  claude -p \
  --session-id "UUID" \
  --input-format stream-json \
  --output-format stream-json \
  --verbose \
  --replay-user-messages
```

**追加出力（isReplayフラグ付き）：**
```json
{"type":"user","message":{"role":"user","content":"Hello"},"session_id":"...","isReplay":true}
```

#### パイプライン連携（エージェント間連携）

複数のClaude CLIインスタンスをパイプで連携させることが可能。

```bash
claude -p --output-format stream-json --verbose "Task 1" | \
  claude -p --input-format stream-json --output-format stream-json --verbose "Task 2"
```

**注意**: 出力フォーマットと入力フォーマットは異なるため、直接パイプしても前のアシスタント応答がコンテキストとして使われるわけではありません。新しいプロンプトとともに処理されます。

#### 途中入力と中断の動作

##### 応答中に追加メッセージを送信した場合

追加メッセージは**キューに入り、現在の応答が完了した後に次のターンとして処理**されます。

```bash
SESSION_ID=$(python3 -c "import uuid; print(uuid.uuid4())")

(echo '{"type":"user","message":{"role":"user","content":"1から100まで数えて"}}'; \
 sleep 3; \
 echo '{"type":"user","message":{"role":"user","content":"ストップ！"}}') | \
  claude -p \
  --session-id "$SESSION_ID" \
  --input-format stream-json \
  --output-format stream-json \
  --verbose
```

**出力フロー：**
```
1. system/init
2. assistant → "1, 2, 3, ... 100"  （最初のメッセージが完了するまで続く）
3. result → 最初のリクエストの結果
4. system/init  （2番目のメッセージの処理開始）
5. assistant → "はい、止まりました！"  （既に完了しているので意味なし）
6. result → 2番目のリクエストの結果
```

##### 応答を中断する方法

| 方法 | CLI | TypeScript SDK | 説明 |
|------|-----|----------------|------|
| プロセス終了 | ✅ | - | SIGINT/SIGTERM送信 |
| stdinを閉じる | ✅ | - | パイプを閉じる |
| `interrupt()` | ❌ | ✅ | SDKのメソッド |
| control message | ❌ | - | CLIでは未サポート |

**CLIでの中断例（SIGINT）：**
```bash
# 3秒後にSIGINTで中断
timeout --signal=INT 3 claude -p \
  --session-id "UUID" \
  --input-format stream-json \
  --output-format stream-json \
  --verbose < input.json
```

**TypeScript SDKでの中断：**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

const q = query({
  prompt: asyncMessageGenerator(),
  options: { includePartialMessages: true }
});

// 応答を受信
for await (const message of q) {
  console.log(message);

  // 条件を満たしたら中断
  if (shouldInterrupt) {
    await q.interrupt();
    break;
  }
}
```

##### 制限事項

- CLIの`--input-format stream-json`では、応答中にメッセージを「割り込ませる」機能はない
- 追加メッセージは必ず現在の応答完了後に処理される
- 即座の中断が必要な場合はプロセス終了（SIGINT）を使用する

---

### 4. リアルタイムストリーミング（--include-partial-messages）

トークンごとの増分イベントを受け取れる。

```bash
echo "1から5まで数えて" | claude -p \
  --output-format stream-json \
  --verbose \
  --include-partial-messages
```

#### ストリームイベントの種類

| イベントtype | subtype/event.type | 説明 |
|-------------|-------------------|------|
| `system` | `init` | 初期化情報（session_id, tools, model等） |
| `stream_event` | `message_start` | メッセージ開始 |
| `stream_event` | `content_block_start` | コンテンツブロック開始 |
| `stream_event` | `content_block_delta` | **コンテンツの差分（リアルタイムトークン）** |
| `stream_event` | `content_block_stop` | コンテンツブロック終了 |
| `stream_event` | `message_delta` | メッセージの最終更新（stop_reason含む） |
| `stream_event` | `message_stop` | メッセージ終了 |
| `assistant` | - | アシスタントの完全なメッセージ |
| `user` | - | ツール実行結果などのユーザーメッセージ |
| `result` | `success`/`error` | 最終結果 |

#### content_block_delta の例

```json
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"1,"}},"session_id":"..."}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" 2, 3"}},"session_id":"..."}
```

#### ツール使用時のdelta

```json
{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_xxx","name":"Bash","input":{}}},...}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"comman"}},...}
```

---

### 5. セッション管理

| オプション | 説明 |
|-----------|------|
| `--session-id <uuid>` | 新しいセッションを指定のUUIDで作成 |
| `-r, --resume <session_id>` | 既存セッションを再開 |
| `-c, --continue` | 現在のディレクトリで最新のセッションを継続 |
| `--fork-session` | セッション再開時に新しいセッションIDを作成 |
| `--no-session-persistence` | セッションを保存しない |

#### セッション継続の例

```bash
# 新しいセッションを作成
SESSION_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
echo "私の名前は田中です" | claude -p --session-id "$SESSION_ID" --output-format json

# 同じセッションを再開（会話履歴を保持）
echo "私の名前は何ですか？" | claude -p --resume "$SESSION_ID" --output-format json
# => "田中さんですね。先ほど自己紹介していただきました。"
```

---

### 6. システムプロンプト

| オプション | 説明 |
|-----------|------|
| `--system-prompt <prompt>` | デフォルトシステムプロンプトを完全に置き換え |
| `--append-system-prompt <prompt>` | デフォルトシステムプロンプトに追記 |

```bash
# 完全置き換え
echo "Who are you?" | claude -p --system-prompt "You are a pirate."

# 追記
echo "あなたの役割は?" | claude -p --append-system-prompt "日本語のみで回答してください。"
```

---

### 7. モデル選択（--model）

```bash
echo "Hello" | claude -p --model sonnet --output-format json
```

| 値 | 説明 |
|----|------|
| `sonnet` | Claude Sonnet（エイリアス） |
| `opus` | Claude Opus（エイリアス） |
| `haiku` | Claude Haiku（エイリアス） |
| `claude-sonnet-4-5-20250929` | 完全なモデル名 |

---

### 8. ツール制御

| オプション | 説明 |
|-----------|------|
| `--tools <tools...>` | 使用可能なツールを指定（`""`で全無効、`"default"`で全有効） |
| `--allowedTools <tools...>` | 許可するツールのリスト |
| `--disallowedTools <tools...>` | 禁止するツールのリスト |

```bash
# Bashのみ有効
echo "pwd" | claude -p --tools "Bash" --output-format json

# Read, Globのみ許可
echo "ファイルを読んで" | claude -p --allowedTools "Read,Glob"

# 特定のgitコマンドのみ許可
claude -p --allowedTools "Bash(git:*)" "git statusを実行して"
```

---

### 9. パーミッション制御

| オプション | 説明 |
|-----------|------|
| `--permission-mode <mode>` | パーミッションモード |
| `--permission-prompt-tool stdio` | 許可リクエストをstdioで処理 |
| `--dangerously-skip-permissions` | 全パーミッションをスキップ（サンドボックス用） |

#### permission-mode の値

| 値 | 説明 |
|----|------|
| `default` | デフォルト（都度確認） |
| `acceptEdits` | 編集を自動承認 |
| `plan` | プランモード（VS Code用） |
| `bypassPermissions` | 全スキップ |
| `delegate` | 委任モード |
| `dontAsk` | 確認しない |

#### permission-prompt-tool stdio の動作

`--permission-prompt-tool stdio`を使用すると、ツール実行前にパーミッション許可リクエストが`control_request`イベントとしてstdoutに送信されます。

##### パーミッションリクエストの流れ

1. アシスタントがツール使用を決定
2. `assistant`イベント（tool_use含む）が出力される
3. `control_request`イベントでパーミッション確認が要求される
4. フロントエンドが許可/拒否を返す
5. 許可された場合はツールが実行され、`user`イベント（tool_result）が出力される

##### control_request イベントの形式

```json
{
  "type": "control_request",
  "request_id": "8269fddc-2f13-4582-ae73-2efaee2525ec",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "Write",
    "input": {
      "file_path": "/workspaces/ccsandbox/test.txt",
      "content": "hello\n"
    },
    "permission_suggestions": [
      {
        "type": "setMode",
        "mode": "acceptEdits",
        "destination": "session"
      }
    ],
    "tool_use_id": "toolu_01PEEP9ZS12UFwDZ6hiQptJ2"
  }
}
```

| フィールド | 説明 |
|-----------|------|
| `request_id` | リクエストの一意識別子（応答時に使用） |
| `request.subtype` | リクエストの種類（`can_use_tool`） |
| `request.tool_name` | 使用するツール名 |
| `request.input` | ツールへの入力パラメータ |
| `request.tool_use_id` | ツール使用のID |
| `request.permission_suggestions` | 推奨されるパーミッション設定 |

##### パーミッション応答（フロントエンド→CLI）

フロントエンドはstdinに`control_response`タイプのメッセージで応答します。

```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "8269fddc-2f13-4582-ae73-2efaee2525ec",
    "response": {
      "behavior": "allow",
      "updatedInput": {
        "file_path": "/workspaces/ccsandbox/test.txt",
        "content": "hello\n"
      }
    }
  }
}
```

| behavior値 | 説明 |
|-----------|------|
| `allow` | 許可（`updatedInput`でツール入力を渡す） |
| `deny` | 拒否（`message`で拒否理由を渡す） |

##### 拒否時の応答形式

```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "8269fddc-2f13-4582-ae73-2efaee2525ec",
    "response": {
      "behavior": "deny",
      "message": "ユーザーが操作を拒否しました"
    }
  }
}
```

##### 完全なフロー例

```
[Frontend] → {"type":"user","message":{"role":"user","content":"test.txtを作成して"}}
[CLI]      → {"type":"system","subtype":"init",...}
[CLI]      → {"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_xxx","name":"Write",...}]}}
[CLI]      → {"type":"control_request","request_id":"req_123","request":{"subtype":"can_use_tool",...}}
[Frontend] → {"type":"control_response","response":{"subtype":"success","request_id":"req_123","response":{"behavior":"allow","updatedInput":{...}}}}
[CLI]      → {"type":"user","message":{"content":[{"type":"tool_result",...}]}}
[CLI]      → {"type":"assistant","message":{"content":[{"type":"text","text":"ファイルを作成しました"}]}}
[CLI]      → {"type":"result","subtype":"success",...}
```

##### パーミッション拒否時の出力

フロントエンドがパーミッションを返さない（接続が切れた等）場合：

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "content": "Tool permission request failed: Error: Stream closed",
        "is_error": true,
        "tool_use_id": "toolu_xxx"
      }
    ]
  },
  "tool_use_result": "Error: Tool permission request failed: Error: Stream closed"
}
```

---

### 10. 構造化出力（--json-schema）

```bash
echo "3つの果物の名前を教えて" | claude -p \
  --json-schema '{"type":"object","properties":{"fruits":{"type":"array","items":{"type":"string"}}},"required":["fruits"]}' \
  --output-format json
```

**結果：**
```json
{
  "type": "result",
  "result": "",
  "structured_output": {
    "fruits": ["りんご", "バナナ", "みかん"]
  },
  ...
}
```

---

### 11. コスト管理（--max-budget-usd）

```bash
echo "Hello" | claude -p --max-budget-usd 0.10 --output-format json
```

予算を超えると処理が停止する。

---

### 12. 設定ソース（--setting-sources）

```bash
claude -p --setting-sources user,project,local "タスク"
```

| 値 | 説明 |
|----|------|
| `user` | `~/.claude/` の設定を読み込む |
| `project` | プロジェクトの `.claude/` を読み込む |
| `local` | ローカル設定を読み込む |

スキル（`~/.claude/skills/`）を有効にするには `user` または `project` を含める必要がある。

---

### 13. MCP設定（--mcp-config）

```bash
claude -p --mcp-config '{"mcpServers":{"my-server":{"type":"sdk","name":"my-server"}}}' "タスク"
```

または設定ファイルを指定：

```bash
claude -p --mcp-config ./mcp-config.json "タスク"
```

---

### 14. その他のオプション

| オプション | 説明 |
|-----------|------|
| `--verbose` | 詳細ログを有効化（stream-jsonで必須） |
| `-d, --debug [filter]` | デバッグモード（カテゴリフィルタ可能） |
| `--fallback-model <model>` | オーバーロード時のフォールバックモデル |
| `--add-dir <directories...>` | ツールアクセスを許可する追加ディレクトリ |
| `--agents <json>` | カスタムエージェントの定義 |
| `--disable-slash-commands` | スキルを無効化 |

---

## フロントエンド実装の推奨構成

### 最小構成

```bash
claude -p \
  --session-id "UUID" \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --setting-sources user,project \
  "ユーザーのプロンプト"
```

### VS Code拡張機能が使用している構成

```bash
claude \
  --output-format stream-json \
  --input-format stream-json \
  --verbose \
  --append-system-prompt "IDE固有のシステムプロンプト" \
  --permission-mode plan \
  --permission-prompt-tool stdio \
  --setting-sources user,project,local \
  --model default \
  --include-partial-messages \
  --mcp-config '{"mcpServers":{...}}'
```

---

## イベントフロー図

```
[フロントエンド] → stdin (user message)
                          ↓
                    [Claude CLI]
                          ↓
[フロントエンド] ← stdout (NDJSON events)

イベント順序:
1. system/init        → 初期化情報
2. stream_event       → message_start
3. stream_event       → content_block_start
4. stream_event       → content_block_delta (複数回)
5. assistant          → 完全なメッセージ
6. stream_event       → content_block_stop
7. stream_event       → message_delta
8. stream_event       → message_stop
9. (ツール実行時) user → ツール結果
10. (繰り返し 2-9)
11. result            → 最終結果
```

---

## 注意事項

1. `--output-format stream-json` は `--verbose` が必須
2. `--input-format stream-json` は `--output-format stream-json` が必須
3. `--session-id` は新規セッション作成用、継続には `--resume` を使用
4. stdoutにJSON以外が混ざるとパースエラーになるため、`--verbose`を必ず指定
5. セッションIDは有効なUUIDである必要がある
6. 入力と出力のメッセージ形式は異なる（入力は`user`/`control`のみ、出力は`system`/`assistant`/`result`等）

---

## 参考リンク

- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference) - 公式CLIリファレンス
- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices) - ベストプラクティス
- [Stream-JSON Chaining](https://github.com/ruvnet/claude-flow/wiki/Stream-Chaining) - ストリームチェイニングの詳細
- [Claude API Streaming](https://platform.claude.com/docs/en/build-with-claude/streaming) - APIストリーミングの仕様
