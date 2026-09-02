import os
import json
from flask import Flask, request, Response
import requests

app = Flask(__name__)

# Configuration from environment variables with defaults
APPS_SCRIPT_URL = os.getenv(
    "APPS_SCRIPT_URL",
    "https://script.google.com/macros/s/AKfycbw_RQTPhaTeebQ4_DPfdioxzfWDKAjXlDCXcEDJhSItZCDvTzWw3Ijnrc0zMFm6ah4/exec"
)
CORS_ALLOW_ORIGIN = os.getenv("CORS_ALLOW_ORIGIN", "*")
CORS_ALLOW_METHODS = os.getenv("CORS_ALLOW_METHODS", "POST, OPTIONS")
CORS_ALLOW_HEADERS = os.getenv("CORS_ALLOW_HEADERS", "Content-Type")

def add_cors_headers(response: Response) -> Response:
    """Add CORS headers to a Flask Response object."""
    response.headers["Access-Control-Allow-Origin"] = CORS_ALLOW_ORIGIN
    response.headers["Access-Control-Allow-Methods"] = CORS_ALLOW_METHODS
    response.headers["Access-Control-Allow-Headers"] = CORS_ALLOW_HEADERS
    return response

@app.route("/", methods=["OPTIONS", "POST"])
def proxy():
    # Handle preflight request
    if request.method == "OPTIONS":
        resp = Response("", status=200)
        return add_cors_headers(resp)

    # Forward the POST body to the Apps Script
    try:
        # Forward raw data to preserve JSON exactly as received
        upstream = requests.post(
            APPS_SCRIPT_URL,
            data=request.get_data(),
            headers={"Content-Type": request.content_type},
            timeout=10,
        )
    except requests.RequestException as e:
        # Network error – return a JSON error that the client expects
        err_msg = f"Upstream request failed: {e}"
        app.logger.error(err_msg)
        error_body = {"ok": False, "reason": "network", "message": err_msg}
        resp = Response(
            response=json.dumps(error_body),
            status=502,
            mimetype="application/json",
        )
        return add_cors_headers(resp)

    # Prepare response to client
    resp = Response(
        response=upstream.content,
        status=upstream.status_code,
        mimetype=upstream.headers.get("Content-Type", "application/json"),
    )
    return add_cors_headers(resp)

if __name__ == "__main__":
    # Run on localhost only, port 5000 (adjust if needed)
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    app.logger.info(
        f"Starting proxy on 127.0.0.1:{port} -> {APPS_SCRIPT_URL} (CORS origin: {CORS_ALLOW_ORIGIN})"
    )
    app.run(host="127.0.0.1", port=port, debug=debug)
