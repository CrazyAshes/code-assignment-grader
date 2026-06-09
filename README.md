# Code Assignment Grader

> AI-powered desktop app for grading Python and Java programming assignments with rubrics.  
> 基于 AI 的编程作业批改桌面应用，支持 Python / Java、Rubric 评分与批量批改。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## English

### What is this?

**Code Assignment Grader** is a local desktop application (Electron + React) that helps teachers grade programming homework using large language models. Paste a question, rubric, and student code — the app returns structured scores, per-criterion feedback, strengths, bugs, and a final comment.

**Key features:**

| Feature | Description |
|---------|-------------|
| Languages | Python & Java |
| Grading modes | Single student / Batch (class queue) |
| Rubric | Custom rubric + optional global rubric (AP-style defaults) |
| AI providers | OpenAI, Kimi CN (Moonshot) |
| Strictness | Lenient / Balanced / Strict |
| Class roster | Import students, track status per student |
| Export | Simple CSV, detailed CSV, teaching report |
| Privacy | Runs locally; API key stored on your machine only |

---

### Download (Pre-built)

Get the latest release from [GitHub Releases](https://github.com/CrazyAshes/code-assignment-grader/releases):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `Code-Assignment-Grader-x.x.x-arm64.dmg` |
| Windows (64-bit) | `Code-Assignment-Grader-x.x.x-win-x64.zip` |

Each release folder also includes `INSTALL.txt` with step-by-step instructions.

---

### Install — macOS

1. Download and open the `.dmg` file.
2. Drag **Code Assignment Grader** into **Applications**.
3. If macOS shows *"App is damaged and can't be opened"* (Gatekeeper, not real corruption):
   ```bash
   xattr -cr "/Applications/Code Assignment Grader.app"
   ```
   Or double-click `fix-mac-quarantine.command` from the release folder.
4. Launch the app and configure your API Key in **Settings**.

---

### Install — Windows

1. Download and extract the `.zip` file to a folder of your choice.
2. Run `Code Assignment Grader.exe`.
3. If SmartScreen blocks the app: click **More info** → **Run anyway**, or:
   ```powershell
   Unblock-File -Path "C:\Path\To\Code Assignment Grader.exe"
   ```
4. Launch the app and configure your API Key in **Settings**.

---

### Install — From Source (Developers)

**Requirements:** Node.js 18+, npm

```bash
git clone https://github.com/CrazyAshes/code-assignment-grader.git
cd code-assignment-grader
npm install
cp .env.example .env   # optional fallback key for OpenAI
npm run dev
```

> **Security:** Never commit `.env` or share your API Key. Keys entered in the app UI are saved in browser localStorage on your machine.

---

### Usage Guide

#### 1. Configure AI Provider

Open **Settings** (top bar):

1. Choose provider: **OpenAI** or **Kimi CN**
2. Enter your **API Key**
3. Select **Model** (e.g. `gpt-5.4-mini`)
4. Click **Test Connection** to verify

#### 2. Single Mode (one student)

1. Select **Single** mode
2. Choose language: **Python** or **Java**
3. Set **Strictness** (Lenient / Balanced / Strict)
4. Fill in:
   - **Question** — assignment prompt
   - **Rubric** — scoring criteria (use **Split Rubric** to separate sample answer)
   - **Student Code** — paste submission
5. Click **Grade** → view results in the right panel:
   - Total score
   - Per-criterion scores & reasons
   - Strengths / Bugs / Final feedback

#### 3. Batch Mode (whole class)

1. Select **Batch** mode
2. Create or select a **Class** and paste student roster (name per line)
3. Set shared **Question**, **Rubric**, and optional **Sample Answer**
4. Select a student → paste their code → **Save & Queue**
5. Click **Start Queue** to grade all queued students automatically
6. Export results: **Simple CSV** / **Detailed CSV** / **Teaching Report**

#### 4. Global Rubric (optional)

Enable **Use Global Rubric** to apply AP-style "no penalty" rules on top of your rubric. Edit defaults per language in **Global Rubric Assistant**.

---

### Build Release Packages

```bash
npm run release       # macOS DMG (Apple Silicon)
npm run release:win   # Windows ZIP (x64)
npm run release:all   # Both platforms
```

Output is organized under `release/`:

```
release/
├── mac-arm64/
│   ├── Code-Assignment-Grader-1.0.0-arm64.dmg
│   ├── fix-mac-quarantine.command
│   └── INSTALL.txt
└── win-x64/
    ├── Code-Assignment-Grader-1.0.0-win-x64.zip
    └── INSTALL.txt
```

---

## 中文

### 这是什么？

**Code Assignment Grader** 是一款本地桌面应用（Electron + React），帮助教师使用大语言模型批改编程作业。输入题目、评分标准（Rubric）和学生代码，即可获得结构化评分、分项反馈、优点、缺陷与总评。

**主要功能：**

| 功能 | 说明 |
|------|------|
| 语言 | Python、Java |
| 批改模式 | 单人模式 / 批量模式（班级队列） |
| 评分标准 | 自定义 Rubric + 可选全局 Rubric（AP 风格默认） |
| AI 提供商 | OpenAI、Kimi 国内版（Moonshot） |
| 严格度 | 宽松 / 平衡 / 严格 |
| 班级名单 | 导入学生、跟踪每位学生状态 |
| 导出 | 简易 CSV、详细 CSV、教学报告 |
| 隐私 | 本地运行，API Key 仅保存在本机 |

---

### 下载（预编译包）

从 [GitHub Releases](https://github.com/CrazyAshes/code-assignment-grader/releases) 下载最新版本：

| 平台 | 文件 |
|------|------|
| macOS（Apple 芯片） | `Code-Assignment-Grader-x.x.x-arm64.dmg` |
| Windows（64 位） | `Code-Assignment-Grader-x.x.x-win-x64.zip` |

每个发布包文件夹内均包含 `INSTALL.txt` 安装说明。

---

### 安装 — macOS

1. 下载并打开 `.dmg` 文件。
2. 将 **Code Assignment Grader** 拖入「应用程序」。
3. 若提示「已损坏，无法打开」（系统拦截，并非真的损坏）：
   ```bash
   xattr -cr "/Applications/Code Assignment Grader.app"
   ```
   或双击发布包中的 `fix-mac-quarantine.command`。
4. 启动 App，在「设置」中填写 API Key。

---

### 安装 — Windows

1. 下载并解压 `.zip` 到任意文件夹。
2. 运行 `Code Assignment Grader.exe`。
3. 若 SmartScreen 拦截：点击「更多信息」→「仍要运行」，或在 PowerShell 中执行：
   ```powershell
   Unblock-File -Path "C:\路径\Code Assignment Grader.exe"
   ```
4. 启动 App，在「设置」中填写 API Key。

---

### 从源码安装（开发者）

**环境要求：** Node.js 18+、npm

```bash
git clone https://github.com/CrazyAshes/code-assignment-grader.git
cd code-assignment-grader
npm install
cp .env.example .env   # 可选：OpenAI 备用密钥
npm run dev
```

> **安全提示：** 切勿提交 `.env` 或泄露 API Key。在 App 界面输入的密钥保存在本机 localStorage 中。

---

### 使用说明

#### 1. 配置 AI 提供商

打开顶部 **Settings（设置）**：

1. 选择提供商：**OpenAI** 或 **Kimi CN**
2. 填写 **API Key**
3. 选择 **Model（模型）**
4. 点击 **Test Connection（测试连接）** 验证

#### 2. 单人模式

1. 选择 **Single（单人）** 模式
2. 选择语言：**Python** 或 **Java**
3. 设置 **Strictness（严格度）**
4. 填写：
   - **Question（题目）**
   - **Rubric（评分标准）** — 可用 **Split Rubric** 拆分参考答案
   - **Student Code（学生代码）**
5. 点击 **Grade（批改）** → 右侧面板查看：
   - 总分
   - 分项得分与理由
   - 优点 / 缺陷 / 总评

#### 3. 批量模式

1. 选择 **Batch（批量）** 模式
2. 创建或选择 **Class（班级）**，粘贴学生名单（每行一个姓名）
3. 设置统一的 **Question、Rubric、Sample Answer**
4. 选择学生 → 粘贴代码 → **Save & Queue（保存并加入队列）**
5. 点击 **Start Queue（开始队列）** 自动批改
6. 导出：**Simple CSV / Detailed CSV / Teaching Report**

#### 4. 全局 Rubric（可选）

开启 **Use Global Rubric** 可在 Rubric 之上叠加 AP 风格的「不扣分」规则，可在 **Global Rubric Assistant** 中按语言编辑默认值。

---

### 打包发布

```bash
npm run release       # macOS DMG（Apple 芯片）
npm run release:win   # Windows ZIP（x64）
npm run release:all   # 两个平台
```

产物整理至 `release/` 目录（见上方英文部分目录结构）。

---

## Tech Stack / 技术栈

- Electron · React · Vite · OpenAI SDK
- No backend server — API calls go directly from the desktop app

## License

MIT

## Author

[CrazyAshes](https://github.com/CrazyAshes)
