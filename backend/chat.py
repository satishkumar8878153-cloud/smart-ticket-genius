import os
import json
import re
from datetime import date, timedelta
import httpx

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-flash-lite-latest:generateContent"
)


def _call_gemini(prompt: str) -> str:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set.")
    resp = httpx.post(
        f"{GEMINI_URL}?key={GEMINI_API_KEY}",
        json={"contents": [{"parts": [{"text": prompt}]}]},
        timeout=20,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["candidates"][0]["content"]["parts"][0]["text"]


def parse_intent(message: str) -> dict:
    today = date.today().isoformat()
    prompt = f"""Today's date is {today}.
Extract train search details from this message and return ONLY a JSON
object, no other text, no markdown fences.

Message: "{message}"

JSON keys required:
- source: station name or null
- destination: station name or null
- date: YYYY-MM-DD format (resolve words like "tomorrow" using today's
  date above) or null
- travelClass: one of "SL","3A","2A","1A","CC","EC" or null if not
  mentioned

Example output: {{"source": "Patna", "destination": "Mumbai",
"date": "{(date.today() + timedelta(days=1)).isoformat()}",
"travelClass": null}}"""

    raw = _call_gemini(prompt)
    cleaned = re.sub(r"^```json\s*|\s*```$", "", raw.strip())
    return json.loads(cleaned)


def explain_result(user_message: str, result: dict) -> str:
    best = result.get("best", {})
    prompt = f"""The user asked: "{user_message}"

Here is the top train recommendation found:
- Train: {best.get('trainName')} ({best.get('trainNumber')})
- Confirmation probability: {best.get('confirmProbability')}%
- Reason: {best.get('reason')}

Write a short (2-3 sentence), friendly reply to the user recommending
this train and briefly explaining why, in a conversational tone."""

    return _call_gemini(prompt).strip()
