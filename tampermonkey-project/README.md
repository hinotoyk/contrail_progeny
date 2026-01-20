# 云崽高亮器 (Contrail Progeny Highlighter)

这是一个 Tampermonkey (油猴) 脚本，用于在各大赛马网站上自动高亮显示「铁鸟翱天 (Contrail/コントレイル)」的产驹，并提供详细的马匹信息展示。

## ✨ 功能特点

*   **自动高亮**：在支持的网站上自动识别并高亮显示铁鸟翱天的产驹。
*   **信息展示**：提供悬浮窗展示马匹的详细资料，包括：
    *   **基本信息**：马名、性别、毛色、马主、生产牧场、调教师等。
    *   **血统信息**：母名、母父名。
    *   **详细评价**：包含近况更新、牧场评价、血统分析及备考信息。
*   **数据同步**：脚本自动从 GitHub 获取最新的马匹数据（`Contrail's Crops Progress 2023.json`）。

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

## 📂 数据来源

马匹数据存储在 [`tampermonkey-project/data/Contrail's Crops Progress 2023.json`](tampermonkey-project/data/Contrail's%20Crops%20Progress%202023.json) 文件中。脚本会远程读取此文件以获取最新的马匹列表和详细信息。

## 📝 许可证

CC BY-NC-SA 4.0
