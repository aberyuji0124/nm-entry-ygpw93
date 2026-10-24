#!/usr/bin/env python3
"""公式サイトから月例会の日程を取り込み、data/schedule.json を作る。

- 標準ライブラリだけで動く（追加インストール不要）。
- 公式サイトに負荷をかけないよう、1件ごとに待ち時間を入れる。
- 取得に失敗したときは、前回の schedule.json を残し、data/status.json に失敗を書く。
- 個人名（主催・幹事・事務局長など）は取り込まない。
"""
import json
import os
import re
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone

BASE = "https://nm2014.jp"
LIST_URL = BASE + "/lists/"
UA = "NMEntryHelper/1.0 (member tool; low-frequency fetch; once a day)"
WAIT = float(os.environ.get("NM_WAIT", "1.5"))  # 秒。1件ごとの待ち時間
JST = timezone(timedelta(hours=9))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
MIN_ROWS = 50  # これより少なければ「公式サイトの構成が変わった」とみなす


def get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ja"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.geturl(), r.read().decode("utf-8", "replace")


def text(s):
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = (s.replace("&amp;", "&").replace("&nbsp;", " ").replace("&lt;", "<")
         .replace("&gt;", ">").replace("&quot;", '"').replace("&#039;", "'"))
    return re.sub(r"[ \t　]+", " ", s).strip()


def load_json(name, default):
    try:
        with open(os.path.join(DATA, name), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save_json(name, obj):
    path = os.path.join(DATA, name)
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(path + ".tmp", path)


def parse_list(html):
    """一覧ページ → [{date,time,name,url,area,stars}]"""
    if not all(h in html for h in ("日付", "時間", "支部名", "開催エリア", "星")):
        raise ValueError("一覧表の見出し（日付・時間・支部名・開催エリア・星）が見つかりません")
    rows = []
    for tr in re.findall(r"<tr>(.*?)</tr>", html, re.S):
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        if len(tds) < 5:
            continue
        m = re.search(r"(\d{4})年.*?(\d{1,2})月(\d{1,2})日", text(tds[0]).replace("\n", ""), re.S)
        t = re.search(r"(\d{1,2})時(\d{2})分", tds[1])
        a = re.search(r'href="(https://nm2014\.jp/shibu/[^"]+)"[^>]*>(.*?)</a>', tds[2], re.S)
        if not (m and a):
            continue
        rows.append({
            "date": "%04d-%02d-%02d" % tuple(map(int, m.groups())),
            "time": "%02d:%s" % (int(t.group(1)), t.group(2)) if t else "",
            "name": text(a.group(2)),
            "url": a.group(1),
            "area": text(tds[3]),
            "stars": text(tds[4]).count("★"),
        })
    return rows


def days_before(s):
    if re.search(r"前日", s):
        return 1
    if re.search(r"当日", s):
        return 0
    m = re.search(r"(\d+)\s*日前", s)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+)\s*時間前", s)  # 「24時間前」は1日前として扱う
    return -(-int(m.group(1)) // 24) if m else None


def parse_detail(html):
    d = {}
    for dt, dd in re.findall(r"<dl>\s*<dt>(.*?)</dt>\s*<dd>(.*?)</dd>\s*</dl>", html, re.S):
        d[text(dt)] = dd
    out = {}
    m = re.search(r"(\d{4})年</span>\s*(\d{1,2})月(\d{1,2})日", d.get("開催日", ""))
    if m:
        out["date"] = "%04d-%02d-%02d" % tuple(map(int, m.groups()))
    if "最寄駅" in d:
        out["station"] = text(d["最寄駅"])
    if "参加締切" in d:
        raw = text(d["参加締切"])
        out["deadline_text"] = raw[:200]
        head, _, tail = raw.partition("※")
        out["deadline_days"] = days_before(head)
        g = re.search(r"ゲスト[^\n]*?(\d+\s*日前|前日|当日)", tail)
        out["guest_deadline_days"] = days_before(g.group(1)) if g else None
    if "申込窓口" in d:
        dd = d["申込窓口"]
        urls, mailto = [], False
        for u in re.findall(r'href="([^"]+)"', dd):
            if u.startswith("mailto:"):
                mailto = True  # メールアドレスは保存しない（個人情報のため）
                continue
            if "nm2014.jp/guest" in u or u in urls:
                continue
            urls.append(u.replace("&amp;", "&"))
        body = re.sub(r'<a[^>]*class="btn"[^>]*>.*?</a>', "", dd, flags=re.S)
        note = text(body)
        mail_re = r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"
        out["apply_urls"] = urls
        out["apply_note"] = re.sub(mail_re, "（メールアドレスは支部ページで確認）", note)[:300]
        out["apply_mail"] = bool(mailto or re.search(mail_re, note))
        out["apply_mailto_link"] = mailto
    return out


def classify(det):
    """申込方法を決める。メールの宛先は保存しない（利用者は公式の支部ページで確認する）"""
    urls = det.get("apply_urls", [])
    if det.get("apply_mailto_link"):
        return "mail", ""
    for u in urls:
        if re.search(r"forms\.gle/|docs\.google\.com/forms", u):
            return "google", u
    for u in urls:
        if re.search(r"line\.me|lin\.ee", u):
            return "line", u
    if urls:
        return "form", urls[0]
    if det.get("apply_mail"):
        return "mail", ""
    return "none", ""


def parse_google_form(url):
    """Googleフォームの項目一覧（質問名・entry番号・選択肢）を取り出す。失敗したら None"""
    final, html = get(url)
    if "docs.google.com/forms" not in final:
        return None
    m = re.search(r"FB_PUBLIC_LOAD_DATA_\s*=\s*(\[.*?\]);\s*</script>", html, re.S)
    if not m:
        return None
    data = json.loads(m.group(1))
    fields = []
    for item in data[1][1] or []:
        title, typ, ents = item[1], item[3], item[4]
        if not ents:
            continue
        for q in ents:
            opts = [o[0] for o in (q[1] or []) if o and o[0]]
            fields.append({"title": (title or "").strip(), "type": typ, "entry": q[0],
                           "required": bool(q[2]), "options": opts})
    base = final.split("?")[0]
    return {"action": base, "fields": fields}


def main():
    now = datetime.now(JST)
    prev = load_json("schedule.json", {})
    status = {"ok": False, "checked_at": now.isoformat(timespec="seconds"),
              "message": "", "warnings": []}
    try:
        _, html = get(LIST_URL)
        rows = parse_list(html)
        if len(rows) < MIN_ROWS:
            raise ValueError("取得できた件数が少なすぎます（%d件）。公式サイトの構成が変わった可能性があります" % len(rows))
    except Exception as e:
        status["message"] = "最新情報を取得できませんでした: %s" % e
        save_json("status.json", status)
        print(status["message"], file=sys.stderr)
        return 1

    today = now.date().isoformat()
    rows = [r for r in rows if r["date"] >= today]
    prev_forms = prev.get("forms", {})
    prev_detail = prev.get("details", {})
    details, forms, fail = {}, {}, 0
    urls = sorted({r["url"] for r in rows})
    for i, u in enumerate(urls):
        time.sleep(WAIT)
        try:
            _, h = get(u)
            det = parse_detail(h)
            if "date" not in det:
                raise ValueError("開催日が読み取れません")
            kind, target = classify(det)
            det["apply_type"], det["apply_target"] = kind, target
            details[u] = det
        except Exception as e:
            fail += 1
            if u in prev_detail:
                details[u] = prev_detail[u]
            status["warnings"].append("%s: %s" % (u, e))
    if urls and fail > len(urls) * 0.3:
        status["message"] = "最新情報を取得できませんでした: 詳細ページの%d/%d件が読み取れません。公式サイトの構成が変わった可能性があります" % (fail, len(urls))
        save_json("status.json", status)
        print(status["message"], file=sys.stderr)
        return 1

    for u, det in details.items():
        if det["apply_type"] != "google":
            continue
        t = det["apply_target"]
        if t in forms:
            continue
        if t in prev_forms and prev_forms[t]:
            forms[t] = prev_forms[t]  # 同じURLなら再取得しない
            continue
        time.sleep(WAIT)
        try:
            forms[t] = parse_google_form(t)
        except Exception as e:
            forms[t] = None
            status["warnings"].append("form %s: %s" % (t, e))

    out = {"generated_at": now.isoformat(timespec="seconds"), "events": rows,
           "details": details, "forms": forms}
    save_json("schedule.json", out)
    status.update(ok=True, message="%d件の月例会を取り込みました" % len(rows),
                  events=len(rows), branches=len(urls), failed_details=fail,
                  google_forms=len(forms),
                  forms_readable=sum(1 for v in forms.values() if v))
    status["warnings"] = status["warnings"][:30]
    save_json("status.json", status)
    print(status["message"], "（詳細失敗%d件）" % fail)
    return 0


if __name__ == "__main__":
    sys.exit(main())
