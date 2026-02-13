# ABOUTME: Pytest fixtures and configuration for steel-cookbook tests
# ABOUTME: Provides common test utilities and session management

import os
import pytest
from unittest.mock import Mock


@pytest.fixture
def mock_steel_session():
    """Mock Steel session object for unit tests."""
    session = Mock()
    session.id = "test-session-id"
    session.session_viewer_url = "https://test.steel.dev/session/test-session-id"
    return session


@pytest.fixture
def mock_steel_client(mock_steel_session):
    """Mock Steel client for unit tests."""
    client = Mock()
    client.sessions = Mock()
    client.sessions.create.return_value = mock_steel_session
    client.sessions.release.return_value = None
    return client


@pytest.fixture
def valid_api_key():
    """Provide a valid-looking API key for testing."""
    return "sk_test_valid_api_key_12345"


@pytest.fixture
def temp_env_file(tmp_path, valid_api_key):
    """Create a temporary .env file for testing."""
    env_file = tmp_path / ".env"
    env_file.write_text(f"STEEL_API_KEY={valid_api_key}")
    return str(env_file)


@pytest.fixture
def test_api_key():
    """Get the actual API key from environment for integration tests.

    Returns None if not set, allowing tests to be skipped gracefully.
    """
    return os.getenv("STEEL_API_KEY")


@pytest.fixture
def requires_api_key(test_api_key):
    """Fixture that marks integration tests as skipped if no API key is available."""
    if not test_api_key or test_api_key == "your-steel-api-key-here":
        pytest.skip("STEEL_API_KEY not set - skipping integration test")
    return test_api_key
