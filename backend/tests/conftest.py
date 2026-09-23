import pytest
from fastapi.testclient import TestClient

from app.catalog import load_catalog
from app.main import create_app


@pytest.fixture(scope="session")
def catalog():
    return load_catalog()


@pytest.fixture
def payload():
    return dict(city="Алматы", date="2026-10-10", event_format="корпоратив", category="Ведущий",
                budget_kzt=1000000, language="русский", duration_hours=4)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("ENABLE_AI", "false")
    with TestClient(create_app()) as test_client:
        yield test_client
