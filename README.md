# Bill List Batch Generator

Upload one or more PDF invoices, scanned invoice images, or a direct billLists JSON file and generate or validate the `version` + `billLists` JSON document in the exact shape you specified.

## Run

Windows:

```text
run_app.bat
```

macOS / Linux:

```text
bash run_app.sh
```

Or run directly with Python:

```powershell
python server.py
```

Then open:

```text
http://127.0.0.1:8000
```

To allow another machine on the same network to open it, set `BILLLIST_HOST=0.0.0.0` before starting the server.

## How It Works

- Upload multiple invoice PDFs or scanned images at once, or upload one JSON file to validate.
- Choose `transType` from `1` to `4`.
- Enter the vehicle number.
- If `transType = 2`, select one of the four address presets in the frontend.
- Generate the batch JSON, or validate the uploaded JSON and review it.

## Notes

- Text-based PDFs are read directly.
- Scanned PDFs and image files use OCR through a local Tesseract install.
- Install Tesseract OCR and add it to `PATH`, or set `TESSERACT_CMD` to the full `tesseract.exe` path.
- Scanned PDFs may also need Poppler for page rendering. If Poppler is not installed, upload the scanned invoice as an image.
- `transDocDate` uses today's date in `dd/mm/yyyy`.
- The special distance rule for `517501 -> 517507` returns `2 km`.
