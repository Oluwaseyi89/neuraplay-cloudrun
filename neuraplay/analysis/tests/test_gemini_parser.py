from neuraplay_ai.services.gemini_service import _parse_insights_to_structured

# Shape of a real Gemini "detailed" response: Markdown dividers, numbered headings, nested bullets
GEMINI_MARKDOWN = """Coach's Analysis Report

---

**FIRST: Key Gameplay Elements**

1.  **Proactive Vision Placement & Control Wards:**
    *   **Action:** Buy a control ward.
2.  **Hyper-Aware Minimap Scanning & Pings:**
-
•
3.

---

- Practice drill: last-hit 80 CS by 10 minutes
**Performance Rating:** **40%**"""


def test_parser_never_returns_empty_tips_or_drills():
    result = _parse_insights_to_structured(GEMINI_MARKDOWN)

    assert result["top_tips"] == [
        "**Proactive Vision Placement & Control Wards:**",
        "**Hyper-Aware Minimap Scanning & Pings:**",
    ]
    assert result["drills"] == ["Practice drill: last-hit 80 CS by 10 minutes"]
    assert all(result["top_tips"]) and all(result["drills"])


def test_parser_keeps_leading_numbers_in_tip_text():
    result = _parse_insights_to_structured("- 3 wards in river before 3:00\n• 2v2 trades only with jungler nearby")

    assert result["top_tips"] == ["3 wards in river before 3:00", "2v2 trades only with jungler nearby"]


def test_parser_falls_back_to_sentences_when_only_markers_present():
    result = _parse_insights_to_structured("---\n-\nStay near your tower. Ward the river. Track the jungler.")

    assert result["top_tips"] == ["Stay near your tower.", "Ward the river.", "Track the jungler."]


def test_parser_reads_percentage_rating():
    result = _parse_insights_to_structured("Tip 1: Stay safe.\nPerformance Rating: 40%")

    assert result["estimated_score"] == 0.4
    assert result["rating"] == 4.6
