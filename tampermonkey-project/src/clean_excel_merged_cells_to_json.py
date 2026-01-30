import pandas as pd
import json
import sys
import io
import os
from datetime import datetime
from typing import List, Dict

import xml.etree.ElementTree as ET
from zipfile import ZipFile

from openpyxl import load_workbook

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
        "excel_file": "C:/Users/hinotoyk/Desktop/Contrail's Crops Progress 2023.xlsx",
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
    if val is None:
        return ""

    if isinstance(val, float) and pd.isna(val):
        return ""

    if isinstance(val, str):
        cleaned = val.strip()
    else:
        if pd.isna(val):
            return ""
        cleaned = str(val).strip()

    return cleaned.replace("\r\n", "\n").replace("\r", "\n")


def apply_inherit_columns(df, inherit_columns, record_key):
    valid_mask = df[record_key].notna()
    for col in inherit_columns:
        if col in df.columns:
            df.loc[valid_mask, col] = df.loc[valid_mask, col].ffill()
    return df


def _find_sheet_path(zf: ZipFile, sheet_name: str) -> str:
    ns_main = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    ns_rel = {"rel": "http://schemas.openxmlformats.org/package/2006/relationships"}

    workbook_xml = zf.read("xl/workbook.xml")
    workbook_tree = ET.fromstring(workbook_xml)

    sheets_node = workbook_tree.find("main:sheets", ns_main)
    if sheets_node is None:
        raise ValueError("workbook.xml 缺少 sheets 节点")

    target_rid = None
    for sheet in sheets_node.findall("main:sheet", ns_main):
        if sheet.get("name") == sheet_name:
            target_rid = sheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
            break

    if target_rid is None:
        raise ValueError(f"工作表 {sheet_name} 未找到")

    rels_xml = zf.read("xl/_rels/workbook.xml.rels")
    rels_tree = ET.fromstring(rels_xml)

    for rel in rels_tree.findall("rel:Relationship", ns_rel):
        if rel.get("Id") == target_rid:
            target = rel.get("Target")
            if target.startswith("/"):
                target = target[1:]
            if not target.startswith("xl/"):
                target = f"xl/{target}"
            return target

    raise ValueError(f"未找到工作表 {sheet_name} 对应的 xml 文件")


def _load_shared_strings(zf: ZipFile) -> List[str]:
    try:
        data = zf.read("xl/sharedStrings.xml")
    except KeyError:
        return []

    ns = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    tree = ET.fromstring(data)
    strings = []
    for si in tree.findall("main:si", ns):
        texts = []
        for t in si.findall('.//main:t', ns):
            texts.append(t.text or "")
        strings.append("".join(texts))
    return strings


def _column_index_from_ref(cell_ref: str) -> int:
    col_part = "".join(ch for ch in cell_ref if ch.isalpha())
    idx = 0
    for ch in col_part:
        idx = idx * 26 + (ord(ch.upper()) - ord('A') + 1)
    return idx - 1


def _parse_sheet_rows(zf: ZipFile, sheet_path: str, shared_strings: List[str]) -> List[List[object]]:
    ns = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    sheet_tree = ET.fromstring(zf.read(sheet_path))

    rows: List[List[object]] = []
    max_columns = 0

    for row_node in sheet_tree.findall("main:sheetData/main:row", ns):
        row_values: List[object] = []
        for cell in row_node.findall("main:c", ns):
            cell_ref = cell.get("r")
            if not cell_ref:
                continue

            col_idx = _column_index_from_ref(cell_ref)
            while len(row_values) <= col_idx:
                row_values.append(None)

            cell_type = cell.get("t")
            value_text = None

            if cell_type == "inlineStr":
                texts = []
                for t in cell.findall("main:is//main:t", ns):
                    texts.append(t.text or "")
                value = "".join(texts)
            else:
                value_node = cell.find("main:v", ns)
                value_text = value_node.text if value_node is not None else None

                if cell_type == "s" and value_text is not None:
                    idx = int(value_text)
                    value = shared_strings[idx] if 0 <= idx < len(shared_strings) else ""
                elif cell_type == "b" and value_text is not None:
                    value = value_text == "1"
                else:
                    value = value_text

            row_values[col_idx] = value

        max_columns = max(max_columns, len(row_values))
        rows.append(row_values)

    # 对齐所有行长度
    for r in rows:
        if len(r) < max_columns:
            r.extend([None] * (max_columns - len(r)))

    return rows


def _load_sheet_with_zip_parser(excel_file: str, sheet_name: str) -> pd.DataFrame:
    with ZipFile(excel_file) as zf:
        sheet_path = _find_sheet_path(zf, sheet_name)
        shared_strings = _load_shared_strings(zf)
        rows = _parse_sheet_rows(zf, sheet_path, shared_strings)

    if not rows:
        return pd.DataFrame(columns=EXPECTED_COLUMNS)

    if len(rows) <= 1:
        header_row = rows[0] if rows else []
        data_rows = []
    else:
        header_row = rows[1]
        data_rows = rows[2:]

    df = pd.DataFrame(data_rows, columns=header_row)
    return df


def _load_sheet_with_openpyxl(excel_file: str, sheet_name: str):
    try:
        wb = load_workbook(filename=excel_file, data_only=True, read_only=True)
    except TypeError as e:
        if "expected <class 'openpyxl.styles.fills.Fill'>" in str(e):
            return _load_sheet_with_zip_parser(excel_file, sheet_name)
        raise

    try:
        sheet = wb[sheet_name]
        rows = list(sheet.iter_rows(values_only=True))
    finally:
        wb.close()

    if not rows:
        return pd.DataFrame(columns=EXPECTED_COLUMNS)

    if len(rows) <= 1:
        header_row = rows[0] if rows else []
        data_rows = []
    else:
        header_row = rows[1]
        data_rows = rows[2:]

    df = pd.DataFrame(data_rows, columns=header_row)
    return df


def process_single_excel(config: Dict) -> List[Dict]:
    print(f"▶ 处理文件: {config['excel_file']} | Sheet: {config['sheet_name']}")

    try:
        df = pd.read_excel(
            config["excel_file"],
            sheet_name=config["sheet_name"],
            skiprows=1,
            header=0,
            engine="openpyxl"
        )
    except TypeError as e:
        if "expected <class 'openpyxl.styles.fills.Fill'>" not in str(e):
            raise
        print("   ⚠️ openpyxl 样式解析失败，尝试改用低层 xml 解析")
        df = _load_sheet_with_zip_parser(
            config["excel_file"],
            config["sheet_name"]
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

print("\n✅ 全部完成")
print(f"📦 总记录数: {len(all_records)}")
print(f"📄 输出文件: {OUTPUT_JSON}")
