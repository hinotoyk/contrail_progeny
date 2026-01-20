import pandas as pd
import json
import sys
import io
import os
from datetime import datetime
from typing import List, Dict

# ===============================
# 1. 全局配置
# ===============================

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# 输出到 ../data/ContrailCrops.json
OUTPUT_JSON = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "ContrailCrops.json")

# 期望的列（顺序即语义）
EXPECTED_COLUMNS = [
    "序号", "馬名", "译名", "馬主", "性別", "毛色",
    "母名", "母父名", "生产牧场", "管理調教師",
    "近况更新/近走/牧场评价", "血统分析", "备考"
]

# ===============================
# 可配置：哪些字段需要“继承”（合并单元格）
# ===============================

INHERIT_COLUMNS = [
    "馬主",
]

RECORD_KEY_COLUMN = "序号"

# ===============================
# 2. 多 Excel 源配置（⭐ 核心）
# ===============================

EXCEL_SOURCES: List[Dict] = [
    {
        "excel_file": "C:/Users/hinotoyk/Desktop/test/Contrail's Crops Progress 2023-1.xlsx",
        "sheet_name": "2023年生（2025年2岁）",
        "source": "2023"
    },
    #{
    #    "excel_file": "C:/Users/hinotoyk/Desktop/test/Contrail_2024.xlsx",
    #    "sheet_name": "2024年生（2026年2岁）",
    #    "source": "2024"
    #}
]

# ===============================
# 3. 工具函数
# ===============================

def normalize_text(val) -> str:
    return (
        str(val)
        .strip()
        .replace("\r\n", "\n")
        .replace("\r", "\n")
    )


def apply_inherit_columns(df, inherit_columns, record_key):
    valid_mask = df[record_key].notna()
    for col in inherit_columns:
        if col in df.columns:
            df.loc[valid_mask, col] = df.loc[valid_mask, col].ffill()
    return df


def process_single_excel(config: Dict) -> List[Dict]:
    print(f"▶ 处理文件: {config['excel_file']} | Sheet: {config['sheet_name']}")

    df = pd.read_excel(
        config["excel_file"],
        sheet_name=config["sheet_name"],
        skiprows=1,
        header=0,
        engine="openpyxl"
    )

    df = df.iloc[:, :len(EXPECTED_COLUMNS)]
    df.columns = EXPECTED_COLUMNS

    df = df.dropna(subset=[RECORD_KEY_COLUMN]).reset_index(drop=True)
    df[RECORD_KEY_COLUMN] = pd.to_numeric(
        df[RECORD_KEY_COLUMN], errors="coerce"
    ).astype("Int64")

    df = apply_inherit_columns(df, INHERIT_COLUMNS, RECORD_KEY_COLUMN)

    for col in df.columns:
        df[col] = df[col].apply(normalize_text)

    df = df.fillna("")

    records = df.to_dict(orient="records")

    # ⭐ 加来源信息
    for r in records:
        r["_source"] = config.get("source", "")

    print(f"   ✔ 生成 {len(records)} 条记录")
    return records


# ===============================
# 4. 主流程：聚合
# ===============================

all_records: List[Dict] = []

for cfg in EXCEL_SOURCES:
    try:
        records = process_single_excel(cfg)
        all_records.extend(records)
    except Exception as e:
        print(f"❌ 处理失败: {cfg['excel_file']} -> {e}")

# ===============================
# 5. 输出
# ===============================

# 备份旧文件
if os.path.exists(OUTPUT_JSON):
    # 获取当前日期，格式 YYYY_MM_DD
    date_str = datetime.now().strftime("%Y_%m_%d")
    # 构造备份文件名: ContrailCrops_2025_01_20_bak.json
    filename = os.path.basename(OUTPUT_JSON)
    name, ext = os.path.splitext(filename)
    backup_filename = f"{name}_{date_str}_bak{ext}"
    backup_path = os.path.join(os.path.dirname(OUTPUT_JSON), backup_filename)
    
    try:
        os.rename(OUTPUT_JSON, backup_path)
        print(f"📦 已备份旧文件: {backup_filename}")
    except Exception as e:
        print(f"⚠️ 备份失败: {e}")

with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
    json.dump(all_records, f, ensure_ascii=False, indent=2)

print("\n✅ 全部完成")
print(f"📦 总记录数: {len(all_records)}")
print(f"📄 输出文件: {OUTPUT_JSON}")
