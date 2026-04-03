"""
Google Sheets → ContrailCrops.json 转换工具

从 Google Sheets 下载 CSV 数据，转换为 ContrailCrops.json。
也支持从本地 Excel 文件读取（作为备用方案）。

用法:
    python clean_excel_merged_cells_to_json.py              # 从 Google Sheets 下载
    python clean_excel_merged_cells_to_json.py --local       # 从本地 Excel 读取
"""

import csv
import json
import sys
import io
import os
import argparse
import urllib.request
from datetime import datetime
from typing import List, Dict, Optional

# ===============================
# 1. 全局配置
# ===============================

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# 输出到 ../data/ContrailCrops.json
OUTPUT_JSON = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data", "ContrailCrops.json"
)

# Google Sheets 配置
GOOGLE_SHEET_ID = "1lUlndcCVPly7dV13LswGZKlaMu145XBVGxl4hXIkfus"

SHEET_SOURCES: List[Dict] = [
    {
        "gid": "35201753",
        "source": "2023",
        "label": "2023年生（2025年2岁）"
    },
    {
        "gid": "2033113937",
        "source": "2024",
        "label": "2024年生（2026年2岁）"
    }
]

# 期望的列（新表格不含"序号"列）
EXPECTED_COLUMNS = [
    "馬名", "译名", "馬主", "性別", "毛色",
    "母名", "母父名", "生产牧场", "管理調教師",
    "近况更新/近走/牧场评价", "血统分析", "备考"
]

# 列名别名映射（兼容不同 sheet 的列名差异）
COLUMN_ALIASES = {
    "血统评价": "血统分析"
}

# 可配置：哪些字段需要"继承"（合并单元格）
INHERIT_COLUMNS = [
    "馬主",
]

# 本地 Excel 源配置（备用）
LOCAL_EXCEL_SOURCES: List[Dict] = [
    # {
    #     "excel_file": "C:/Users/hinotoyk/Desktop/Contrail's Crops Progress 2023.xlsx",
    #     "sheet_name": "2023年生（2025年2岁）",
    #     "source": "2023"
    # },
]


# ===============================
# 2. 工具函数
# ===============================

def normalize_text(val) -> str:
    """清理并规范化文本值"""
    if val is None:
        return ""
    if isinstance(val, str):
        cleaned = val.strip()
    else:
        cleaned = str(val).strip()
    if not cleaned:
        return ""
    return cleaned.replace("\r\n", "\n").replace("\r", "\n")


def normalize_column_name(name: str) -> str:
    """应用列名别名映射"""
    return COLUMN_ALIASES.get(name, name)


# ===============================
# 3. Google Sheets 数据获取
# ===============================

def build_sheet_csv_url(gid: str) -> str:
    """构建 Google Sheets CSV 导出 URL"""
    return f"https://docs.google.com/spreadsheets/d/{GOOGLE_SHEET_ID}/export?format=csv&gid={gid}"


def download_sheet_csv(gid: str) -> str:
    """从 Google Sheets 下载 CSV 数据"""
    url = build_sheet_csv_url(gid)
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            return response.read().decode("utf-8")
    except Exception as e:
        raise RuntimeError(f"下载 Google Sheet (gid={gid}) 失败: {e}")


def process_google_sheet(config: Dict) -> List[Dict]:
    """处理单个 Google Sheet，返回记录列表"""
    print(f"▶ 下载 Google Sheet: {config['label']} (gid={config['gid']})")

    csv_text = download_sheet_csv(config["gid"])
    reader = csv.reader(io.StringIO(csv_text))
    rows = list(reader)

    if not rows:
        print(f"   ⚠️ Sheet 为空")
        return []

    # 第一行是表头
    raw_headers = rows[0]
    # 应用别名映射
    headers = [normalize_column_name(h) for h in raw_headers]

    records = []
    for row in rows[1:]:
        # 跳过空行
        if not any(cell.strip() for cell in row):
            continue

        record = {}
        for i, header in enumerate(headers):
            if not header:
                continue
            val = row[i] if i < len(row) else ""
            record[header] = normalize_text(val)

        # 必须有马名
        if not record.get("馬名"):
            continue

        # 加来源信息
        record["_source"] = config.get("source", "")

        records.append(record)

    # 处理合并单元格继承（馬主）
    last_values = {}
    for record in records:
        for col in INHERIT_COLUMNS:
            if col in record:
                if record[col]:
                    last_values[col] = record[col]
                elif col in last_values:
                    record[col] = last_values[col]

    print(f"   ✔ 生成 {len(records)} 条记录")
    return records


# ===============================
# 4. 本地 Excel 数据获取（备用）
# ===============================

def process_local_excel(config: Dict) -> List[Dict]:
    """处理本地 Excel 文件（保留作为备用方案）"""
    try:
        import pandas as pd
        from openpyxl import load_workbook
    except ImportError:
        print("   ⚠️ 需要安装 pandas 和 openpyxl: pip install pandas openpyxl")
        return []

    excel_file = config["excel_file"]
    sheet_name = config["sheet_name"]
    print(f"▶ 处理本地文件: {excel_file} | Sheet: {sheet_name}")

    if not os.path.exists(excel_file):
        print(f"   ❌ 文件不存在: {excel_file}")
        return []

    try:
        df = pd.read_excel(
            excel_file,
            sheet_name=sheet_name,
            header=0,
            engine="openpyxl"
        )
    except Exception as e:
        print(f"   ❌ 读取失败: {e}")
        return []

    # 应用列名别名
    df.columns = [normalize_column_name(str(c)) for c in df.columns]

    # 只保留期望的列
    available_cols = [c for c in EXPECTED_COLUMNS if c in df.columns]
    df = df[available_cols]

    # 去除没有马名的行
    if "馬名" in df.columns:
        df = df.dropna(subset=["馬名"]).reset_index(drop=True)

    # 处理合并单元格继承
    for col in INHERIT_COLUMNS:
        if col in df.columns:
            df[col] = df[col].ffill()

    # 规范化文本
    for col in df.columns:
        df[col] = df[col].apply(lambda x: normalize_text(x) if pd.notna(x) else "")

    df = df.fillna("")

    records = df.to_dict(orient="records")

    # 加来源信息
    for r in records:
        r["_source"] = config.get("source", "")

    print(f"   ✔ 生成 {len(records)} 条记录")
    return records


# ===============================
# 5. 主流程
# ===============================

def main():
    parser = argparse.ArgumentParser(description="Google Sheets → ContrailCrops.json 转换工具")
    parser.add_argument("--local", action="store_true",
                        help="从本地 Excel 文件读取（而非 Google Sheets）")
    args = parser.parse_args()

    all_records: List[Dict] = []

    if args.local:
        print("📖 模式: 本地 Excel 文件")
        if not LOCAL_EXCEL_SOURCES:
            print("❌ 没有配置本地 Excel 源，请在脚本中编辑 LOCAL_EXCEL_SOURCES")
            sys.exit(1)
        for cfg in LOCAL_EXCEL_SOURCES:
            try:
                records = process_local_excel(cfg)
                all_records.extend(records)
            except Exception as e:
                print(f"❌ 处理失败: {cfg.get('excel_file', '?')} -> {e}")
    else:
        print("🌐 模式: Google Sheets 下载")
        for cfg in SHEET_SOURCES:
            try:
                records = process_google_sheet(cfg)
                all_records.extend(records)
            except Exception as e:
                print(f"❌ 处理失败: {cfg.get('label', '?')} -> {e}")

    if not all_records:
        print("❌ 没有获取到任何数据")
        sys.exit(1)

    # ===============================
    # 6. 输出
    # ===============================

    # 备份旧文件
    if os.path.exists(OUTPUT_JSON):
        date_str = datetime.now().strftime("%Y_%m_%d")
        filename = os.path.basename(OUTPUT_JSON)
        name, ext = os.path.splitext(filename)

        counter = 0
        while True:
            suffix = f"_{counter}" if counter else ""
            backup_filename = f"{name}_{date_str}_bak{suffix}{ext}"
            backup_path = os.path.join(os.path.dirname(OUTPUT_JSON), backup_filename)
            if not os.path.exists(backup_path):
                break
            counter += 1

        try:
            os.rename(OUTPUT_JSON, backup_path)
            print(f"📦 已备份旧文件: {backup_filename}")
        except Exception as e:
            print(f"⚠️ 备份失败: {e}")

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(all_records, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 全部完成")
    print(f"📦 总记录数: {len(all_records)}")
    print(f"📄 输出文件: {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
