"""Beeblio research helpers for the pinned sandbox Python environment.

Mirrors the semantics of the former JavaScript research SDK: table I/O with
provenance-safe writes, missing-value detection, coercion, descriptive
statistics, frequency tables, and dataset profiling — implemented on pandas
so saved analysis scripts get the same guarantees one-shot programs had.

Typical use inside a saved script under /workspace/3-Analysis:

    import beeblio_research as research
    df = research.read_table("/workspace/2-Data/survey.csv")
    print(research.describe(df["wellbeing_score"]))
    print(research.frequencies(df, "work_arrangement"))
    research.write_table("/workspace/2-Data/derived/survey-clean.csv", df)
"""

from __future__ import annotations

import json
import math
import os
import re
from typing import Any, Iterable

import pandas as pd

__all__ = [
    "MISSING_DEFAULTS",
    "MAX_TABLE_BYTES",
    "assert_",
    "describe",
    "escape_html",
    "frequencies",
    "is_missing",
    "number",
    "profile",
    "read_table",
    "to_serializable",
    "validate_description",
    "write_json",
    "write_table",
    "write_text",
]

MISSING_DEFAULTS = frozenset({"", "na", "n/a", "null", "undefined"})
MAX_TABLE_BYTES = 32 * 1024 * 1024

_TEXT_EXTENSIONS = (".html", ".htm", ".md", ".txt")
_NUMBER_PATTERN = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)")


def is_missing(value: Any, extra: Iterable[str] = ()) -> bool:
    """True for None/NaN and the conventional missing tokens ("", NA, N/A, null...)."""
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    normalized = str(value).strip().lower()
    if normalized in MISSING_DEFAULTS:
        return True
    return any(str(item).strip().lower() == normalized for item in extra)


def number(
    value: Any,
    missing: Iterable[str] = (),
    minimum: float | None = None,
    maximum: float | None = None,
    extract: bool = False,
) -> float | None:
    """Coerce a value to float; None for missing, unparseable, non-finite, or out of range.

    Commas are stripped. With extract=True the first numeric substring is used.
    """
    if is_missing(value, missing):
        return None
    normalized = str(value).strip().replace(",", "")
    match = _NUMBER_PATTERN.search(normalized) if extract else None
    candidate = match.group(0) if match is not None else normalized
    if not candidate:
        return None
    try:
        parsed = float(candidate)
    except ValueError:
        return None
    if not math.isfinite(parsed):
        return None
    if minimum is not None and parsed < minimum:
        return None
    if maximum is not None and parsed > maximum:
        return None
    return parsed


def escape_html(value: Any) -> str:
    """Escape a value for safe interpolation into HTML text and attributes."""
    return (
        str(value if value is not None else "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def _path_first(path: Any, payload: Any, function: str) -> tuple[str, Any]:
    """Tolerate the pandas-style (data, path) argument order: swap when the
    destination is where the data should be. A repr-like multi-line string
    (e.g. str(DataFrame)) is never a path."""
    if not isinstance(path, str) and isinstance(payload, str):
        path, payload = payload, path
    if not isinstance(path, str) or "\n" in path:
        raise TypeError(
            f"{function}(path, ...): the destination path must come first and be a plain string; got {type(path).__name__}"
        )
    return path, payload


def _require_new_file(path: str, overwrite: bool) -> None:
    if not overwrite and os.path.exists(path):
        raise FileExistsError(
            f"Refusing to overwrite an existing file: {path}. Pass overwrite=True only for an explicitly requested in-place revision."
        )


def _as_frame(table: Any) -> pd.DataFrame:
    if isinstance(table, pd.DataFrame):
        return table
    return pd.DataFrame(list(table))


def read_table(path: str) -> pd.DataFrame:
    """Read a CSV/TSV/TAB/JSON table (<= 32 MiB) into a pandas DataFrame.

    JSON tables may be an array of row objects or an object containing a
    rows/data/values array.
    """
    path = str(path)
    size = os.path.getsize(path)
    if size > MAX_TABLE_BYTES:
        raise ValueError(
            f"Table exceeds the {MAX_TABLE_BYTES // (1024 * 1024)} MiB in-memory limit; use a purpose-built streaming workflow"
        )
    lower = path.lower()
    if lower.endswith(".csv"):
        return pd.read_csv(path)
    if lower.endswith((".tsv", ".tab")):
        return pd.read_csv(path, sep="\t")
    if lower.endswith(".json"):
        with open(path, encoding="utf-8") as handle:
            value = json.load(handle)
        rows = None
        if isinstance(value, list):
            rows = value
        elif isinstance(value, dict):
            for key in ("rows", "data", "values"):
                candidate = value.get(key)
                if isinstance(candidate, list):
                    rows = candidate
                    break
        if rows is None:
            raise ValueError("JSON table must be an array or contain rows/data/values")
        return pd.DataFrame(rows)
    raise ValueError("read_table supports CSV, TSV, and JSON files")


def write_table(path: str, table: Any, *, overwrite: bool = False) -> str:
    """Write a DataFrame (or rows iterable) as CSV/TSV/JSON; create-new by default.

    The path comes first (write_table(path, table)), though a pandas-style
    (table, path) call is tolerated.
    """
    path, table = _path_first(path, table, "write_table")
    _require_new_file(path, overwrite)
    frame = _as_frame(table)
    lower = path.lower()
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    if lower.endswith(".csv"):
        frame.to_csv(path, index=False, lineterminator="\n")
    elif lower.endswith((".tsv", ".tab")):
        frame.to_csv(path, index=False, sep="\t", lineterminator="\n")
    elif lower.endswith(".json"):
        records = json.loads(frame.to_json(orient="records"))
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(records, handle, ensure_ascii=False, indent=2, allow_nan=False, default=str)
            handle.write("\n")
    else:
        raise ValueError("write_table supports CSV, TSV, and JSON files")
    return path


def write_json(path: str, value: Any, *, overwrite: bool = False, indent: int = 2) -> str:
    """Write JSON with non-finite floats and dates made JSON-safe; create-new by default."""
    path, value = _path_first(path, value, "write_json")
    _require_new_file(path, overwrite)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(to_serializable(value), handle, ensure_ascii=False, indent=indent, allow_nan=False, default=str)
        handle.write("\n")
    return path


def write_text(path: str, text: Any, *, overwrite: bool = False) -> str:
    """Write an HTML/Markdown/plain-text document; create-new by default."""
    path, text = _path_first(path, text, "write_text")
    _require_new_file(path, overwrite)
    if not path.lower().endswith(_TEXT_EXTENSIONS):
        raise ValueError("write_text supports HTML, Markdown, and plain-text outputs")
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(str(text))
    return path


def _column_values(frame: pd.DataFrame, name: str) -> list[Any]:
    return [None if pd.isna(value) else value for value in frame[name].tolist()]


def _describe_numeric(values: list[Any], missing: Iterable[str] = ()) -> dict[str, Any]:
    numeric = [item for item in (number(value, missing) for value in values) if item is not None]
    ordered = sorted(numeric)
    n = len(ordered)
    missing_count = len(values) - n
    if not n:
        return {
            "n": 0,
            "missing": missing_count,
            "mean": None,
            "median": None,
            "standardDeviation": None,
            "std": None,
            "stdDev": None,
            "min": None,
            "max": None,
            "q1": None,
            "q3": None,
        }
    mean = sum(ordered) / n
    variance = sum((item - mean) ** 2 for item in ordered) / (n - 1) if n > 1 else None
    standard_deviation = math.sqrt(variance) if variance is not None else None

    def quantile(probability: float) -> float:
        index = (n - 1) * probability
        lower = math.floor(index)
        fraction = index - lower
        if lower + 1 >= n:
            return ordered[lower]
        return ordered[lower] + fraction * (ordered[lower + 1] - ordered[lower])

    result = {
        "n": n,
        "missing": missing_count,
        "mean": mean,
        "median": quantile(0.5),
        "standardDeviation": standard_deviation,
        "min": ordered[0],
        "max": ordered[-1],
        "q1": quantile(0.25),
        "q3": quantile(0.75),
    }
    result["std"] = result["stdDev"] = result["standardDeviation"]
    return validate_description(result)


def _categorical_summary(column: list[Any], missing: Iterable[str] = ()) -> dict[str, Any]:
    present = [value for value in column if not is_missing(value, missing)]
    return {
        "type": "categorical",
        "count": len(present),
        "missing": len(column) - len(present),
        "distinct": len({str(value) for value in present}),
        "mean": None,
        "median": None,
        "std": None,
        "stdDev": None,
        "standardDeviation": None,
        "min": None,
        "max": None,
        "q1": None,
        "q3": None,
    }


def _describe_column(column: list[Any], missing: Iterable[str] = ()) -> dict[str, Any]:
    present = [value for value in column if not is_missing(value, missing)]
    numeric = bool(present) and all(number(value, missing) is not None for value in present)
    if not numeric:
        return _categorical_summary(column, missing)
    summary = _describe_numeric(column, missing)
    return {"type": "numeric", "count": summary["n"], **summary}


def describe(values: Any, column: str | None = None) -> dict[str, Any]:
    """Descriptive statistics for a column of values (n, missing, mean, median,
    standardDeviation/std/stdDev, min, max, q1, q3). describe(df) returns typed
    per-column summaries; describe(df, "column") (or describe(df["column"]))
    returns the single-column numeric summary."""
    if column is not None:
        if isinstance(values, pd.DataFrame):
            selected = _column_values(values, column)
        else:
            selected = [row.get(column) if isinstance(row, dict) else None for row in values]
        return _describe_numeric(selected)
    if isinstance(values, pd.DataFrame):
        return {name: _describe_column(_column_values(values, name)) for name in values.columns}
    if isinstance(values, pd.Series):
        return _describe_numeric([None if pd.isna(value) else value for value in values.tolist()])
    if isinstance(values, list) and any(
        isinstance(item, dict) for item in values if item is not None
    ):
        return describe(pd.DataFrame(values))
    return _describe_numeric(list(values))


def frequencies(values: Any, column: str | None = None) -> dict[str, Any] | list[dict[str, Any]]:
    """Frequency table for a column of values: {n, missing, levels}, each level
    carrying value/level, count, percent (0-100), and percentage (0-1), sorted
    by count desc then value. With a column name, values is a DataFrame (or
    rows) and just the levels list is returned."""
    if column is not None:
        if isinstance(values, pd.DataFrame):
            selected = _column_values(values, column)
        else:
            selected = [row.get(column) if isinstance(row, dict) else None for row in values]
        result = frequencies(selected)
        assert isinstance(result, dict)
        return result["levels"]
    if isinstance(values, pd.Series):
        cells = [None if pd.isna(value) else value for value in values.tolist()]
    else:
        cells = list(values)
    counts: dict[str, int] = {}
    missing_count = 0
    for value in cells:
        if is_missing(value):
            missing_count += 1
            continue
        key = str(value).strip()
        counts[key] = counts.get(key, 0) + 1
    valid = len(cells) - missing_count
    levels = sorted(
        (
            {
                "value": key,
                "level": key,
                "count": count,
                "percent": (count / valid * 100) if valid else 0.0,
                "percentage": (count / valid) if valid else 0.0,
            }
            for key, count in counts.items()
        ),
        key=lambda level: (-level["count"], str(level["value"])),
    )
    if sum(level["count"] for level in levels) != valid:
        raise RuntimeError("Frequency counts do not reconcile")
    return {"n": valid, "missing": missing_count, "levels": levels}


def profile(
    table: Any,
    *,
    sample_size: int = 5,
    missing: Iterable[str] = (),
) -> dict[str, Any]:
    """Quick dataset profile: row/column counts, per-column missing/distinct/
    inferredType, and the first rows as a sample."""
    frame = _as_frame(table)
    sample_size = max(1, min(sample_size, 20))
    columns = []
    for name in frame.columns:
        column = _column_values(frame, name)
        present = [value for value in column if not is_missing(value, missing)]
        numeric = sum(1 for value in present if number(value, missing) is not None)
        columns.append(
            {
                "name": name,
                "missing": len(column) - len(present),
                "distinct": len({str(value) for value in present}),
                "inferredType": "number" if present and numeric == len(present) else "string",
            }
        )
    sample = frame.head(sample_size)
    sample_records = json.loads(sample.to_json(orient="records"))
    return {
        "rowCount": len(frame),
        "columnCount": len(columns),
        "columns": columns,
        "sample": sample_records,
    }


def validate_description(summary: dict[str, Any]) -> dict[str, Any]:
    """Reject internally inconsistent descriptive statistics (NaN stats, negative
    counts, or min/q1/median/q3/max ordering violations)."""
    for key in ("mean", "median", "standardDeviation", "min", "max", "q1", "q3"):
        value = summary.get(key)
        if value is not None and not (isinstance(value, (int, float)) and math.isfinite(value)):
            raise ValueError(f"Invalid descriptive statistic: {key}")
    if summary.get("n", 0) < 0 or summary.get("missing", 0) < 0:
        raise ValueError("Counts cannot be negative")
    if summary.get("n", 0) > 0:
        for lesser, greater in (("min", "q1"), ("q1", "median"), ("median", "q3"), ("q3", "max")):
            low, high = summary.get(lesser), summary.get(greater)
            if low is not None and high is not None and low > high:
                raise ValueError("Descriptive statistics failed ordering validation")
    return summary


def assert_(condition: Any, message: str = "Research assertion failed") -> None:
    """Assert a research postcondition; raise with the message when it fails."""
    if not condition:
        raise AssertionError(message)


def to_serializable(value: Any) -> Any:
    """Make a value JSON-safe: non-finite floats become null, sets become lists,
    mappings become dicts, and dates/objects fall back to str."""
    if isinstance(value, dict):
        return {str(key): to_serializable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_serializable(item) for item in value]
    if isinstance(value, (set, frozenset)):
        return [to_serializable(item) for item in sorted(value, key=repr)]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


_API_REFERENCE = """
API quick reference (path comes FIRST for the writers; a pandas-style
(data, path) order is tolerated):
  read_table(path) -> DataFrame                CSV/TSV/JSON table, <= 32 MiB
  write_table(path, table, *, overwrite=False) DataFrame or rows; create-new by default
  write_json(path, value, *, overwrite=False)  create-new by default
  write_text(path, text, *, overwrite=False)   .html/.htm/.md/.txt only
  describe(df) -> {column: {type, count, missing, distinct, mean, median,
               standardDeviation/std/stdDev, min, max, q1, q3}}
  describe(values) or describe(df, "column")   single-column numeric summary
  frequencies(values) -> {n, missing, levels}  levels carry value/level,
  frequencies(df, "column") -> levels           count, percent, percentage
  profile(df, *, sample_size=5)                rows/columns/types/sample
  is_missing(value, extra=())                  "", NA, N/A, null, NaN, None
  number(value, missing=(), minimum=None, maximum=None, extract=False)
  escape_html(value)
  assert_(condition, message="Research assertion failed")
  validate_description(summary)                ordering/sanity checks
"""

if __name__ == "__main__":
    print(_API_REFERENCE.strip())
