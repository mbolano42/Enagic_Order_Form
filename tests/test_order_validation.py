import os
from pathlib import Path
import socketserver
import threading
import unittest

import pymupdf
from playwright.sync_api import sync_playwright

from test_sponsor_signature import QuietHandler


class OrderValidationTest(unittest.TestCase):
    def test_dni_recruiter_and_sponsor_line_in_pdf(self):
        server = socketserver.TCPServer(("127.0.0.1", 0), QuietHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as playwright:
                options = {"headless": True}
                if os.environ.get("CHROME_PATH"):
                    options["executable_path"] = os.environ["CHROME_PATH"]
                browser = playwright.chromium.launch(**options)
                try:
                    page = browser.new_page(accept_downloads=True)
                    page.goto(f"http://127.0.0.1:{server.server_address[1]}/")
                    dni = page.locator('[name="vatNumber"]')
                    self.assertFalse(dni.evaluate("(input) => input.checkValidity()"))
                    for invalid in ("12345678", "12345678X", "12345678Z1", "X1234567L"):
                        dni.fill(invalid)
                        self.assertFalse(dni.evaluate("(input) => input.checkValidity()"), invalid)
                    for valid in ("00000000t", "12345678z"):
                        dni.fill(valid)
                        self.assertTrue(dni.evaluate("(input) => input.checkValidity()"), valid)
                        self.assertEqual(dni.input_value(), valid.upper())

                    line = page.locator('[name="sponsorLine"]')
                    self.assertEqual(line.locator("option").evaluate_all("(options) => options.map(o => o.value)"),
                                     ["", "1", "2", "3", "4", "5", "6"])
                    line.select_option("6")
                    self.assertTrue(page.get_by_text("¿Está dado de alta en el Registro de Operadores Intracomunitarios (ROI)?").is_visible())
                    recruiter_name = page.locator('[name="recruiterName"]')
                    recruiter_id = page.locator('[name="recruiterId"]')
                    self.assertTrue(recruiter_name.is_disabled())
                    self.assertTrue(recruiter_id.is_disabled())
                    page.check('[name="donatePoints"][value="yes"]')
                    self.assertTrue(recruiter_name.is_enabled())
                    self.assertTrue(recruiter_id.is_enabled())
                    self.assertFalse(recruiter_name.evaluate("(input) => input.required"))
                    self.assertFalse(recruiter_id.evaluate("(input) => input.required"))
                    recruiter_name.fill("RECLUTADOR PRUEBA")
                    recruiter_id.fill("ID-123")

                    for name, value in [("registration", "user"), ("product", "k8"), ("payment", "transfer")]:
                        page.check(f'[name="{name}"][value="{value}"]')
                    for name, value in {
                        "name": "CLIENTE PRUEBA", "address": "CALLE MAYOR", "zip": "28001",
                        "city": "MADRID", "country": "ESPANA", "phone": "600123456",
                        "email": "cliente@example.com", "sponsorName": "PATROCINADOR", "sponsorId": "123",
                    }.items():
                        page.locator(f'[name="{name}"]').fill(value)
                    page.check('[name="accepted"]')
                    canvas = page.locator("#signature-canvas")
                    canvas.scroll_into_view_if_needed()
                    box = canvas.bounding_box()
                    page.mouse.move(box["x"] + 20, box["y"] + 20)
                    page.mouse.down()
                    page.mouse.move(box["x"] + 90, box["y"] + 80)
                    page.mouse.up()

                    def download():
                        page.locator("#submit-button").click()
                        page.wait_for_selector("#download-options:not([hidden])")
                        with page.expect_download() as downloaded:
                            page.locator("#download-button").click()
                        return pymupdf.open(stream=Path(downloaded.value.path()).read_bytes(), filetype="pdf")

                    pdf = download()
                    first = pdf[0]
                    self.assertIn("12345678Z", first.get_textbox(pymupdf.Rect(348, 239, 557, 257)))
                    self.assertIn("6", first.get_textbox(pymupdf.Rect(180, 572, 208, 586)))
                    self.assertIn("RECLUTADOR PRUEBA", first.get_textbox(pymupdf.Rect(377, 536, 570, 554)))
                    self.assertIn("ID-123", first.get_textbox(pymupdf.Rect(377, 554, 570, 572)))
                    pdf.close()

                    page.check('[name="donatePoints"][value="no"]')
                    self.assertTrue(recruiter_name.is_disabled())
                    self.assertTrue(recruiter_id.is_disabled())
                    self.assertEqual(recruiter_name.input_value(), "")
                    self.assertEqual(recruiter_id.input_value(), "")
                    self.assertFalse(page.locator("#download-options").is_visible())
                    pdf = download()
                    self.assertNotIn("RECLUTADOR PRUEBA", pdf[0].get_text())
                    self.assertNotIn("ID-123", pdf[0].get_text())
                    pdf.close()
                finally:
                    browser.close()
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
