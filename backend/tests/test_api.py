import pytest


def test_health_and_options(client):
    assert client.get("/api/health").json() == {"status": "ok", "dataset_count": 66}
    options = client.get("/api/options").json()
    assert options["date_min"] == "2026-09-23"
    assert options["date_max"] == "2026-12-31"
    assert len(options["categories"]) == 17


def test_response_contract(client, payload):
    response = client.post("/api/match", json=payload)
    assert response.status_code == 200
    result = response.json()
    assert set(result) == {"status", "message", "total_in_category", "eligible_count", "returned_count", "rejections", "cards"}
    assert result["returned_count"] == 3
    assert [r["code"] for r in result["rejections"]] == ["busy", "format", "budget", "language", "duration"]
    assert set(result["cards"][0]) == {"id", "name", "category", "city", "price_from_kzt", "languages", "max_hours", "explanation", "explanation_mode", "evidence", "flags"}
    assert all(c["explanation_mode"] == "local" for c in result["cards"])


@pytest.mark.parametrize("changes", [
    {"budget_kzt": 0}, {"budget_kzt": -1}, {"budget_kzt": True}, {"budget_kzt": "1000000"},
    {"budget_kzt": 1.5}, {"duration_hours": 0}, {"duration_hours": -3},
    {"duration_hours": True}, {"duration_hours": "4"}, {"language": ""},
    {"language": "клингонский"}, {"city": "Москва"}, {"category": "Несуществующая"},
    {"event_format": "Несуществующий"}, {"date": "2027-01-01"}, {"date": "2026-09-22"},
    {"date": "2026-02-30"}, {"date": "2026-10-10T00:00:00"}, {"date": 1791586800},
    {"unexpected": "field"},
])
def test_invalid_input_envelope(client, payload, changes):
    response = client.post("/api/match", json={**payload, **changes})
    assert response.status_code == 422
    assert set(response.json()) == {"error"}
    assert response.json()["error"]["code"] == "validation_error"


def test_invalid_json(client):
    response = client.post("/api/match", content="{", headers={"content-type": "application/json"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_no_old_mutating_endpoints(client):
    for endpoint in ("/api/chat", "/api/docs"):
        assert client.post(endpoint, json={}).status_code == 404


def test_optional_fields_can_be_omitted(client, payload):
    payload.pop("language")
    payload.pop("duration_hours")
    assert client.post("/api/match", json=payload).status_code == 200
