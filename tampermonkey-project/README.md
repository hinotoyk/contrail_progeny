# 云崽高亮器 (Contrail Progeny Highlighter)

这是一个 Tampermonkey (油猴) 脚本，用于在各大赛马网站上自动高亮显示「铁鸟翱天 (Contrail/コントレイル)」的产驹，并提供详细的马匹信息展示。

## ✨ 功能特点

*   **自动高亮**：在支持的网站上自动识别并高亮显示铁鸟翱天的产驹。
*   **信息展示**：提供悬浮窗展示马匹的详细资料，包括：
    *   **基本信息**：马名、性别、毛色、马主、生产牧场、调教师等。
    *   **血统信息**：母名、母父名。
    *   **详细评价**：包含近况更新、牧场评价、血统分析及备考信息。
*   **数据同步**：
    *   脚本自动从 GitHub 获取最新的基础马匹数据（`ContrailCrops.json`）。
    *   集成 Google Sheets 数据源，获取更实时的赛程和更新。

## 🌐 支持网站

脚本目前支持以下网站：

*   [JRA (日本中央竞马会)](https://www.jra.go.jp/)
*   [JBIS Search](https://www.jbis.or.jp/)
*   [netkeiba.com](https://www.netkeiba.com/)
*   [竞马之魅力 (keibanomiryoku.com)](https://www.keibanomiryoku.com/)

## 🚀 安装方法

1.  请确保您的浏览器已安装 **Tampermonkey** 扩展。
2.  创建一个新脚本。
3.  将 [`tampermonkey-project/src/index.js`](tampermonkey-project/src/index.js) 文件中的代码复制并粘贴到编辑器中。
4.  保存脚本 (Ctrl+S)。

## 🛠️ 数据维护与开发

本项目包含一个 Python 脚本，用于将本地 Excel 维护的马匹数据转换为脚本所需的 JSON 格式。

### 1. 数据源
数据主要在本地 Excel 文件中维护（如 `Contrail's Crops Progress 2023.xlsx`）。

### 2. 数据转换脚本
使用 [`tampermonkey-project/src/clean_excel_merged_cells_to_json.py`](tampermonkey-project/src/clean_excel_merged_cells_to_json.py) 将 Excel 数据转换为 JSON。

**脚本功能：**
*   读取配置的 Excel 文件源（支持多个年份/Sheet）。
*   处理合并单元格（自动继承"马主"等字段）。
*   清洗数据并生成 JSON 文件输出到 [`tampermonkey-project/data/ContrailCrops.json`](tampermonkey-project/data/ContrailCrops.json)。

**运行环境依赖：**
```bash
pip install pandas openpyxl
```

## 📂 核心文件说明

*   **`src/index.js`**: Tampermonkey 脚本源代码 (v2.0.0)。
*   **`src/clean_excel_merged_cells_to_json.py`**: 数据处理脚本，负责将 Excel 转换为 JSON。
*   **`data/ContrailCrops.json`**: 脚本读取的静态马匹数据文件。

## 📝 许可证

CC BY-NC-SA 4.0
