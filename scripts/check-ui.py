#!/usr/bin/env python3
"""Exercise the Chinese UI prototype in fresh Chromium contexts.

Requires Python Playwright and Chromium. Does not save screenshots, browser
profiles or uploaded files. Run after starting Vite:
    python scripts/check-ui.py --base-url http://127.0.0.1:5173
"""
import argparse
import sys
from urllib.parse import quote, urlparse

from playwright.sync_api import expect, sync_playwright


class Checks:
    def __init__(self):
        self.total = 0
        self.failures = []

    def assert_(self, label, condition):
        self.total += 1
        if condition:
            print(f"PASS {label}", flush=True)
        else:
            self.failures.append(label)
            print(f"FAIL {label}", flush=True)

    def scenario(self, label, function):
        try:
            function()
        except Exception as error:
            self.total += 1
            detail = f"{label}: {type(error).__name__}: {str(error).splitlines()[0]}"
            self.failures.append(detail)
            print(f"FAIL {detail}", flush=True)


def run(base_url, chromium):
    checks = Checks()
    browser_errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=chromium, headless=True, args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 960}, locale="zh-CN")
        page = context.new_page()
        page.set_default_timeout(6000)
        page.on("pageerror", lambda error: browser_errors.append(str(error)))

        def go(path):
            page.goto(base_url.rstrip("/") + path, wait_until="networkidle")

        def tab(name):
            page.locator(f'.detail-tabs [data-tab="{name}"]').click()

        def selected_tab():
            return page.locator('.detail-tabs [aria-selected="true"]').get_attribute("data-tab")

        def center():
            go("/knowledge")
            checks.assert_("K01 exposes six knowledge spaces", page.locator("#space-grid .space-card").count() == 6)
            page.locator('[data-action="center-tab"][data-tab="项目与专题"]').click()
            page.locator("#space-scope").select_option("shared")
            names = page.locator("#space-grid h3").all_text_contents()
            checks.assert_("type and shared scope compose", set(names) == {"项目案例库", "乡村儿童教育专题库"})
            checks.assert_("combined filter values stay selected", page.locator("#space-scope").input_value() == "shared" and page.locator('[data-tab="项目与专题"]').get_attribute("aria-selected") == "true")
            page.locator('[data-action="center-tab"][data-tab="个人"]').click()
            page.locator("#space-scope").select_option("owned")
            checks.assert_("personal type and owned scope compose", page.locator("#space-grid h3").all_text_contents() == ["我的工作笔记"])
            page.locator('[data-action="center-tab"][data-tab="全部类型"]').click()
            page.locator("#space-scope").select_option("all")
            checks.assert_("recent sorting respects yesterday's time order", page.locator("#space-grid h3").all_text_contents() == ["机构知识库", "项目案例库", "我的工作笔记", "乡村儿童教育专题库", "公益行业政策库", "专家方法论库"])
            page.locator("#space-sort").select_option("name")
            names = page.locator("#space-grid h3").all_text_contents()
            checks.assert_("name sorting produces expected Chinese order", names == ["公益行业政策库", "机构知识库", "我的工作笔记", "乡村儿童教育专题库", "项目案例库", "专家方法论库"])
            page.locator('#space-grid [data-action="favorite"]').first.click()
            checks.assert_("favorite mutation retains chosen sort", page.locator("#space-sort").input_value() == "name")
            checks.assert_("favorite mutation retains ordered cards", page.locator("#space-grid h3").all_text_contents() == names)

        checks.scenario("knowledge center", center)

        def selection_and_modal():
            go("/knowledge/spaces/org")
            page.locator('[data-asset="education-v3"]').click()
            expect(page.locator(".detail-drawer")).to_be_visible()
            checks.assert_("opening a title does not select a batch checkbox", page.locator(".asset-checkbox:checked").count() == 0)
            checks.assert_("detail makes the entire global shell inert", page.locator("#app").evaluate("element => element.inert"))
            focus_stays_inside = True
            for _ in range(22):
                page.keyboard.press("Tab")
                focus_stays_inside &= page.evaluate("Boolean(document.activeElement.closest('#overlays [role=dialog]'))")
            checks.assert_("Tab focus stays in the detail dialog", focus_stays_inside)
            page.keyboard.press("Control+k")
            checks.assert_("search shortcut cannot focus the inert background", page.evaluate("Boolean(document.activeElement.closest('#overlays [role=dialog]'))"))
            page.keyboard.press("Escape")
            expect(page.locator(".detail-drawer")).to_have_count(0)
            checks.assert_("Escape closes detail and returns to its space", urlparse(page.url).path == "/knowledge/spaces/org")
            checks.assert_("closing detail reactivates global shell", not page.locator("#app").evaluate("element => element.inert"))
            page.locator('.asset-checkbox[value="education-v3"]').check()
            checks.assert_("checkbox selection reveals the batch action bar", page.locator(".selection-bar").is_visible())
            checks.assert_("eligible selection enables AI organization", page.locator('#selection-bar [data-action="organize-selected"]').is_enabled())
            page.locator('[data-action="clear-selection"]').click()
            page.locator('.asset-checkbox[value="staff-interview"]').check()
            checks.assert_("blocked-only selection disables batch organization", page.locator('#selection-bar [data-action="organize-selected"]').is_disabled())
            checks.assert_("blocked selection does not change its safety state", "安全阻止" in page.locator(".asset-row").filter(has=page.locator('[data-asset="staff-interview"]')).inner_text())
            page.locator('[data-action="organize-menu"]').click()
            checks.assert_("blocked-only selection also disables the organization menu item", page.locator('.modal [data-action="organize-selected"]').is_disabled())
            page.keyboard.press("Escape")
            page.locator('[data-action="clear-selection"]').click()
            page.locator('[data-action="quick-status"][data-status="failed"]').click()
            checks.assert_("local failed shortcut selects the top needs-processing tab", page.locator('[data-action="file-filter"][data-value="failed"]').get_attribute("aria-selected") == "true")
            checks.assert_("local failed shortcut only lists failed files", page.locator("#asset-rows [data-asset]").all_text_contents() == ["PDF历史项目资料扫描件历史项目留存材料，扫描质量较低，需要重新处理。"])
            checks.assert_("local failed shortcut has matching active state", "active" in page.locator('[data-action="quick-status"][data-status="failed"]').get_attribute("class"))

        checks.scenario("list selection and modal behavior", selection_and_modal)

        def restore_list():
            page.set_viewport_size({"width": 1440, "height": 540})
            go("/knowledge/spaces/org")
            page.locator("#asset-search").fill("项目")
            page.evaluate("window.scrollTo(0, 100)")
            scroll = page.evaluate("window.scrollY")
            checks.assert_("list restoration is tested from nonzero scroll", scroll > 0)
            page.locator('[data-asset="education-v3"]').click()
            tab("证据")
            page.locator('.detail-drawer [data-action="close-detail"]').click()
            checks.assert_("closing detail retains search value", page.locator("#asset-search").input_value() == "项目")
            checks.assert_("closing detail retains matching result set", page.locator("#asset-rows [data-asset]").count() == 5)
            checks.assert_("closing detail restores list scroll", abs(page.evaluate("window.scrollY") - scroll) <= 2)
            page.set_viewport_size({"width": 1440, "height": 960})

        checks.scenario("list restoration", restore_list)

        def evidence():
            go("/knowledge/spaces/org/assets/education-v3?tab=" + quote("证据"))
            checks.assert_("deep link opens the evidence tab", selected_tab() == "证据")
            checks.assert_("three evidence records are shown", page.locator(".detail-evidence-card").count() == 3)
            checks.assert_("records lacking verification timestamps stay pending", page.locator(".detail-verification").all_text_contents() == ["待核验", "待核验", "待核验"])
            history_card = page.locator("#evidence-ev-education-3")
            checks.assert_("historical record offers source reading rather than definite positioning", history_card.locator('[data-action="open-source-unlocated"]').count() == 1 and history_card.locator('[data-action="locate-evidence"]').count() == 0)
            checks.assert_("historical record does not assert a page number", "第 " not in history_card.inner_text() and "原文位置\n待核验" in history_card.inner_text())
            page.locator('#evidence-ev-education-1 [data-action="locate-evidence"]').click()
            checks.assert_("reliable evidence opens source and evidence side by side", page.locator(".detail-source-split").count() == 1)
            checks.assert_("reliable evidence highlights its sample excerpt", page.locator(".highlight-source").count() == 1 and "三个乡镇" in page.locator(".highlight-source").inner_text())
            checks.assert_("reliable evidence retains its page position", "第 12 页" in page.locator(".detail-source-toolbar").inner_text())
            tab("证据")
            history_card.locator('[data-action="open-source-unlocated"]').click()
            checks.assert_("historical reading preserves the warning", "位置待核验" in page.locator(".detail-source-toolbar").inner_text())
            checks.assert_("historical reading cannot invent an excerpt highlight", page.locator(".highlight-source").count() == 0)
            tab("版本")
            page.reload(wait_until="networkidle")
            checks.assert_("version deep link survives refresh", selected_tab() == "版本" and page.locator(".detail-version-item").count() == 3)
            tab("证据")
            page.reload(wait_until="networkidle")
            checks.assert_("evidence deep link survives refresh", selected_tab() == "证据" and page.locator(".detail-evidence-card").count() == 3)

        checks.scenario("evidence trust and source navigation", evidence)

        def chat_roundtrip():
            go("/knowledge/spaces/org/assets/education-v3")
            page.locator('[data-action="ask-asset"]').click()
            checks.assert_("asking from detail opens asset-scoped chat", urlparse(page.url).path == "/chat" and "asset=education-v3" in page.url)
            page.locator("#chat-input").fill("这份资料的主要内容是什么？")
            page.locator('.send-btn').click()
            expect(page.locator(".send-btn")).to_be_enabled(timeout=10000)
            expect(page.locator(".citation-card")).to_have_count(1)
            answer = page.locator(".answer-text").inner_text()
            checks.assert_("scoped answer carries a citation", "阅读与成长支持" in answer and page.locator(".citation-card").count() == 1)
            chat_scroll = page.locator("#chat-messages").evaluate("element => element.scrollTop")
            page.locator(".citation-card").click()
            checks.assert_("citation opens the source reading detail", page.locator(".detail-source-split").count() == 1 and selected_tab() == "原文")
            checks.assert_("chat stays underneath citation detail", page.locator("#chat-messages").count() == 1)
            page.locator('.detail-drawer [data-action="close-detail"]').click()
            checks.assert_("closing a citation returns to chat", urlparse(page.url).path == "/chat" and "asset=education-v3" in page.url)
            checks.assert_("citation roundtrip preserves the complete answer", page.locator(".answer-text").inner_text() == answer)
            checks.assert_("citation roundtrip preserves the user's question", "这份资料的主要内容是什么？" in page.locator(".user-message").inner_text())
            checks.assert_("citation roundtrip restores conversation scroll", abs(page.locator("#chat-messages").evaluate("element => element.scrollTop") - chat_scroll) <= 2)

        checks.scenario("detail to chat citation roundtrip", chat_roundtrip)

        def upload():
            go("/knowledge/spaces/org")
            page.locator('[data-action="upload"]').click()
            page.locator("#upload-file").set_input_files({"name": "本地烟雾验证.txt", "mimeType": "text/plain", "buffer": "这是本地文本，不能伪装为已处理资料。".encode("utf-8")})
            page.locator("#upload-submit").click()
            expect(page.locator(".upload-drawer")).to_have_count(0)
            title = page.locator('[data-asset]').filter(has_text="本地烟雾验证")
            asset_id = title.get_attribute("data-asset")
            row = page.locator(".asset-row").filter(has=title)
            checks.assert_("local upload stays pending service integration", "待接入处理" in row.inner_text() and "可检索" not in row.inner_text())
            record = page.evaluate("id => JSON.parse(localStorage.getItem('mingde-assets')).find(item => item.id === id)", asset_id)
            checks.assert_("local record is explicitly not ready", record["localOnly"] and record["fileStatus"] != "ready")
            title.click()
            checks.assert_("unprocessed local record cannot be queried", page.locator('[data-action="ask-asset"]').is_disabled())
            tab("原文")
            checks.assert_("local record does not receive fabricated source content", page.locator(".detail-example-paper").count() == 0 and "原文件尚未上传" in page.locator(".detail-body").inner_text())
            page.locator('.detail-drawer [data-action="close-detail"]').click()
            page.reload(wait_until="networkidle")
            record = page.evaluate("id => JSON.parse(localStorage.getItem('mingde-assets')).find(item => item.id === id)", asset_id)
            checks.assert_("refresh keeps local uploads unprocessed", record["fileStatus"] != "ready" and "待接入处理" in page.locator(".asset-row").filter(has=page.locator(f'[data-asset="{asset_id}"]')).inner_text())

        checks.scenario("truthful local upload", upload)
        checks.assert_("desktop flows have no uncaught browser errors", not browser_errors)
        context.close()

        mobile = browser.new_context(viewport={"width": 390, "height": 844}, locale="zh-CN", is_mobile=True, has_touch=True)
        phone = mobile.new_page()
        phone.set_default_timeout(6000)

        def mobile_layout():
            for path, label in [("/knowledge", "center"), ("/knowledge/spaces/org", "list"), ("/knowledge/spaces/org/assets/education-v3?tab=" + quote("证据"), "evidence"), ("/knowledge/spaces/org/assets/education-v3?tab=" + quote("原文") + "&evidence=ev-education-1", "source split")]:
                phone.goto(base_url.rstrip("/") + path, wait_until="networkidle")
                sizes = phone.evaluate("({width:document.documentElement.clientWidth, scroll:document.documentElement.scrollWidth})")
                checks.assert_(f"390px {label} has no horizontal page overflow", sizes["scroll"] <= sizes["width"] + 1)
            checks.assert_("mobile context does not inherit desktop local records", phone.evaluate("localStorage.getItem('mingde-assets')") is None)

        checks.scenario("mobile layout", mobile_layout)
        mobile.close()
        browser.close()

    print(f"\n{checks.total - len(checks.failures)}/{checks.total} assertions passed; {len(checks.failures)} failed.", flush=True)
    if checks.failures:
        for failure in checks.failures:
            print(" - " + failure)
    return 1 if checks.failures else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:5173")
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    options = parser.parse_args()
    sys.exit(run(options.base_url, options.chromium))
