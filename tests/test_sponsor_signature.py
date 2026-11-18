import http.server
import os
from pathlib import Path
import socketserver
import threading
import unittest

import pymupdf
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *args):
        pass


class SponsorSignatureTest(unittest.TestCase):
    def test_draw_clear_and_include_sponsor_signature(self):
        server = socketserver.TCPServer(("127.0.0.1", 0), QuietHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as playwright:
                options = {"headless": True}
                if os.environ.get("CHROME_PATH"):
                    options["executable_path"] = os.environ["CHROME_PATH"]
                browser = playwright.chromium.launch(**options)
                try:
                    page = browser.new_page(has_touch=True, accept_downloads=True)
                    page.goto(f"http://127.0.0.1:{server.server_address[1]}/")
                    for name, value in [("registration", "user"), ("product", "k8"), ("payment", "transfer")]:
                        page.check(f'[name="{name}"][value="{value}"]')
                    for name, value in {
                        "name": "CLIENTE PRUEBA", "address": "CALLE MAYOR", "zip": "28001",
                        "city": "MADRID", "country": "ESPANA", "phone": "600123456",
                        "email": "cliente@example.com", "sponsorName": "PATROCINADOR", "sponsorId": "123",
                    }.items():
                        page.locator(f'[name="{name}"]').fill(value)
                    page.check('[name="accepted"]')

                    applicant = page.locator("#signature-canvas")
                    applicant.scroll_into_view_if_needed()
                    box = applicant.bounding_box()
                    page.mouse.move(box["x"] + 20, box["y"] + 20)
                    page.mouse.down()
                    page.mouse.move(box["x"] + 90, box["y"] + 80)
                    page.mouse.up()

                    sponsor = page.locator("#sponsor-signature-canvas")
                    sponsor.scroll_into_view_if_needed()
                    self.assertEqual(sponsor.evaluate("(canvas) => getComputedStyle(canvas).touchAction"), "none")
                    box = sponsor.bounding_box()
                    cdp = page.context.new_cdp_session(page)
                    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": box["x"] + 20, "y": box["y"] + 30}]})
                    cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": box["x"] + 100, "y": box["y"] + 75}]})
                    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
                    self.assertIn("dibujada", page.locator("#sponsor-signature .signature-status").inner_text())

                    page.locator("#submit-button").click()
                    self.assertIn("patrocinador", page.locator("#status").inner_text())
                    page.locator('[name="sponsorDate"]').fill("2026-11-18")
                    page.locator("#submit-button").click()
                    page.wait_for_selector("#send-options:not([hidden])")
                    with page.expect_download() as download:
                        page.locator("#download-button").click()
                    pdf = pymupdf.open(stream=Path(download.value.path()).read_bytes(), filetype="pdf")
                    rectangles = [rect for image in pdf[0].get_images() for rect in pdf[0].get_image_rects(image)]
                    self.assertTrue(any(abs((rect.y0 + rect.y1) / 2 - 612.5) < 0.1 for rect in rectangles))
                    pdf.close()

                    page.locator("#sponsor-signature .signature-clear").click()
                    self.assertFalse(page.locator("#send-options").is_visible())
                    page.locator("#submit-button").click()
                    self.assertIn("patrocinador", page.locator("#status").inner_text())
                    sponsor.scroll_into_view_if_needed()
                    box = sponsor.bounding_box()
                    page.mouse.move(box["x"] + 30, box["y"] + 20)
                    page.mouse.down()
                    page.mouse.move(box["x"] + 90, box["y"] + 60)
                    page.mouse.up()
                    self.assertIn("dibujada", page.locator("#sponsor-signature .signature-status").inner_text())
                finally:
                    browser.close()
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
